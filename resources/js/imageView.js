import { appState } from "./config.js";
import { getLangString } from "./languageController.js";
import { getPages, getMovements, getMeasures, getMeasurePage, getMeasuresOnPage, getAnnotationsOnPage } from "./api.js";
import { getPreference } from "./preferenceController.js";
import { buildTileSource, resolveImagePrefix } from "./imageServer.js";
import { loadLinks } from "./linkController.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

// How long a fresh viewer may take to draw its first tile before the initial page/zone is applied anyway.
const IMAGE_READY_TIMEOUT_MS = 5000;

// Annotation category -> host-supplied icon markup, the same as Edirom-Frontend's ImageViewer.js: the viewer
// has no icon knowledge and inserts whatever zone.iconHtml it is given.
const ANNOTATION_ICON_MARKUP = {
    "annotation.category.beschreibung": '<edirom-icon name="description"></edirom-icon>',
    "annotation.category.rasurTektur": '<edirom-icon name="ink_eraser"></edirom-icon>'
};

// Annotation badges: the scale they have when the whole page is shown, and the largest scale they reach when
// zoomed in (see updateBadgeScale).
const BADGE_SCALE_MIN = 0.6;
const BADGE_SCALE_MAX = 1.5;

/**
 * The URL of the Frontend root. Mobile is served from its `mobile/` directory, and relative URLs in the
 * preferences (image_prefix, additional_css_path) are written for the Frontend page, like `../config.json`.
 * @returns {string}
 */
function getFrontendBaseUrl() {
    return new URL("../", document.baseURI).href;
}

/**
 * Destroys the OpenSeadragon viewers inside `root`. The viewer element does not do that when it is removed,
 * which would leave its WebGL context behind.
 * @param {ParentNode} root - The element that is about to be emptied or replaced
 */
export function disposeImageViewers(root) {
    root?.querySelectorAll?.("edirom-image-viewer").forEach(viewer => viewer.openSeaDragon?.destroy());
}

/**
 * Returns the index of the occurrence of `value` in `arr` (compared as strings)
 * that is nearest to `referenceIndex`. On tie, the earlier index wins.
 * Returns -1 when no match is found.
 * @param {Array} arr
 * @param {string} value
 * @param {number} referenceIndex
 * @returns {number}
 */
function findNearestIndex(arr, value, referenceIndex) {
    const asStrings = arr.map(String);
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < asStrings.length; i++) {
        if (asStrings[i] === String(value)) {
            const distance = Math.abs(i - referenceIndex);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
    }
    return bestIndex;
}

/**
 * Builds the image viewer web component and its control bar together,
 * wiring up bidirectional event listeners via direct variable references.
 * Returns the content container, control bar container, the control bar widget
 * element, an update function for fetching page data, and a setData function
 * for pushing data to the component.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config (currently unused)
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, controlBarWidget: HTMLElement, update: function, setData: function }}
 */
export function buildImageView(target, config = {}) {
    const imageViewComponent = document.createElement("edirom-image-viewer");
    imageViewComponent.classList.add("web-component");
    // Sequence mode: OSD shows one page at a time and only loads that page's
    // tiles – the same as the desktop viewer which calls showImage() once per page.
    imageViewComponent.setAttribute("sequencemode", "true");
    // Hide OSD's built-in sequence controls; the spin box handles navigation.
    imageViewComponent.setAttribute("showsequencecontrol", "false");
    // Host stylesheets that are cloned into the viewer's shadow root: the measure number / annotation badge
    // rules of the Frontend, Mobile's touch adjustments, and the edition's own CSS (like Edirom-Frontend).
    const overlayStylesheets = [
        new URL("resources/css/annotation-style.css", getFrontendBaseUrl()).href,
        new URL("resources/css/image-overlays.css", document.baseURI).href
    ];
    const additionalCssPath = getPreference("additional_css_path");
    if (typeof additionalCssPath === "string" && additionalCssPath.includes("/db/")) {
        overlayStylesheets.push(new URL(additionalCssPath.split("/db/")[1], getFrontendBaseUrl()).href);
    }
    imageViewComponent.setAttribute("overlay-stylesheets", JSON.stringify(overlayStylesheets));

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(imageViewComponent);

    // --- Closure state ---
    let _pages = [];
    let _movements = [];
    let _pageIdToIndex = new Map();   // pageId → 1-based OSD pageNumber

    // Full data (set once in update, survives filter toggles)
    let _fullPages = [];
    let _fullMovements = [];

    // Page mode
    let _pageSequenceData = [];       // [{ type: "page", id: pageId }]
    let _pageLabels = [];

    // Measure mode
    let _measureSequenceData = [];    // [{ type: "zone", id: measureXmlId }]
    let _measureLabels = [];
    let _measuresData = null;         // cached getMeasures response
    let _measurePageIdCache = new Map(); // measureXmlId → pageId
    let _pageMeasuresCache = new Map();  // pageId → getMeasuresOnPage response

    // Subset state: primary measure IDs for the active subset, or null
    let _activeMeasureSubsetIds = null;

    // Active sequence (points to page or measure)
    let _sequenceData = [];
    let _labels = [];
    let _currentSequenceIndex = 0;
    let _viewMode = "page-view";

    // Doc/edition for lazy API calls (set in update)
    let _doc = "";
    let _edition = "";

    // Zones pushed to the viewer's zones-data. Navigation targets (keyed by the raw measure id, without a
    // `type`, so never drawn) are kept apart from overlays (measure numbers, annotation badges), which carry a
    // `type` and are only drawn while that type is in the viewer's visible-types.
    let _navZones = {};               // measureXmlId → { page, ulx, uly, lrx, lry }
    let _overlayZones = {};           // zone key → zone with `type` "measure" or "annotation"
    // The key last written to the viewer's `zone`. The viewer re-applies its active zone on every zones-data
    // push (and never clears it), so this key is left out of pushes unless it is the one being navigated to.
    let _activeZoneKey = null;
    let _pageAnnotationsCache = new Map(); // pageId → Promise of getAnnotationsOnPage response
    let _docGeneration = 0;          // incremented per document, so late responses of an old one are dropped

    // Overlay toggles (per view, not remembered)
    let _showMeasures = false;
    let _showAnnotations = false;
    let _viewerPageNumber = 1;        // 1-based page the viewer currently shows, in every view mode

    // Resolved once the viewer has drawn its first tile. A page or zone set earlier is lost (or lands on the
    // wrong page), because the viewer is created asynchronously after `tilesources` is set.
    let _imageReady = Promise.resolve();
    function resetImageReady() {
        _imageReady = new Promise(resolve => {
            const done = () => {
                clearTimeout(timer);
                imageViewComponent.removeEventListener("image-ready", done);
                resolve();
            };
            const timer = setTimeout(done, IMAGE_READY_TIMEOUT_MS);
            imageViewComponent.addEventListener("image-ready", done);
        });
    }

    // --- getEffectiveMeasuresData ---
    // Returns _measuresData filtered to the active subset, or the full array.
    function getEffectiveMeasuresData() {
        if (!_measuresData) return [];
        if (!_activeMeasureSubsetIds) return _measuresData;
        const subsetSet = new Set(_activeMeasureSubsetIds);
        return _measuresData.filter(group => subsetSet.has(group.measures[0].id));
    }

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");

    // PAGE STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "image-step-spin-box";
    spinBox.setAttribute("label", getLangString("mobile.ImageView_page", "Page"));

    // Spin box → viewer: only set attribute on component, never update spin box directly.
    spinBox.addEventListener("spin-box-step-requested", async (event) => {
        const label = event.detail.requestedStep;
        const idx = findNearestIndex(_labels, label, _currentSequenceIndex);
        if (idx === -1) return;
        _currentSequenceIndex = idx;
        const step = _sequenceData[idx];
        if (step.type === "page") {
            imageViewComponent.setAttribute("pagenumber", String(_pageIdToIndex.get(step.id)));
        } else if (step.type === "zone") {
            await gotoZone(step.id);
        }
    });

    // Viewer → spin box: update spin box only via viewer feedback events.
    imageViewComponent.addEventListener("page-changed", (event) => {
        // The shown page is tracked in every view mode, because the overlays belong to it.
        _viewerPageNumber = event.detail.pageNumber;
        loadOverlaysForCurrentPage();
        if (_viewMode !== "page-view") return;
        const pageNumber = event.detail.pageNumber;
        const idx = _sequenceData.findIndex(
            s => s.type === "page" && _pageIdToIndex.get(s.id) === pageNumber
        );
        if (idx !== -1) {
            _currentSequenceIndex = idx;
            spinBox.setAttribute("current-step", _labels[idx]);
        }
    });

    imageViewComponent.addEventListener("zone-changed", (event) => {
        if (_viewMode !== "measure-view") return;
        const { zoneKey } = event.detail;
        const idx = _sequenceData.findIndex(s => s.type === "zone" && s.id === zoneKey);
        if (idx !== -1) {
            _currentSequenceIndex = idx;
            spinBox.setAttribute("current-step", _labels[idx]);
        }
    });

    // Tapping an annotation badge opens the annotation (the viewer's zone-click does not bubble).
    imageViewComponent.addEventListener("zone-click", (event) => {
        const { type, id } = event.detail;
        if (type === "annotation" && id) {
            loadLinks(id, { behaviour: "updateViewOrCreateViewWindow" });
        }
    });

    // --- Overlay toggle buttons (measure numbers, annotations) ---
    // Like the toggle buttons of Edirom-Frontend, they keep their icon and show whether they are switched on
    // by their background: both states have the same icon, and styles.css colours `current-state="on"`.
    function buildToggleButton(buttonId, iconName, titleKey, titleFallback, setOverlayVisible) {
        const button = document.createElement("edirom-button-widget");
        button.id = buttonId;
        button.setAttribute("states-data", JSON.stringify([
            { name: "off", iconName },
            { name: "on", iconName }
        ]));
        button.setAttribute("current-state", "off");
        button.title = getLangString(titleKey, titleFallback);
        button.addEventListener("button-state-requested", (event) => {
            event.stopPropagation();
            const requestedState = event.detail.requestedState;
            button.setAttribute("current-state", requestedState);
            setOverlayVisible(requestedState === "on");
            applyVisibleTypes();
            loadOverlaysForCurrentPage();
        });
        return button;
    }

    const measureToggleButton = buildToggleButton(
        "image-measure-toggle-button", "eo_toggle_measures",
        "view.window.source.SourceView_showMeasures", "Show/hide measures",
        (visible) => { _showMeasures = visible; });

    const annotationToggleButton = buildToggleButton(
        "image-annotation-toggle-button", "eo_toggle_annotations",
        "view.window.source.SourceView_showAnnotations", "Show/hide annotations",
        (visible) => { _showAnnotations = visible; });

    // --- View mode toggle button ---
    const viewModeButton = document.createElement("edirom-button-widget");
    viewModeButton.id = "image-view-mode-button";
    viewModeButton.setAttribute("states-data", JSON.stringify([
        { name: "page-view", iconName: "fullscreen_portrait" },
        { name: "measure-view", iconName: "float_portrait_2" }
    ]));
    viewModeButton.setAttribute("current-state", "page-view");
    viewModeButton.classList.add("hidden");
    viewModeButton.addEventListener("button-state-requested", (event) => {
        switchViewMode(event.detail.requestedState);
    });

    // --- Control bar layout ---
    // [ spacer ] [ measureToggle ] [ annotationToggle ] [ viewModeButton ] [ spinBox ]
    controlBar.appendChild(spacer);
    controlBar.appendChild(measureToggleButton);
    controlBar.appendChild(annotationToggleButton);
    controlBar.appendChild(viewModeButton);
    controlBar.appendChild(spinBox);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    // --- fetchAndCachePageMeasures ---
    // Fetches the measures on a page once (concurrent callers share the request) and registers them as
    // navigation targets and, for the measure numbers, as overlay zones.
    function fetchAndCachePageMeasures(pageId) {
        if (!_pageMeasuresCache.has(pageId)) {
            _pageMeasuresCache.set(pageId, loadPageMeasures(pageId));
        }
        return _pageMeasuresCache.get(pageId);
    }

    async function loadPageMeasures(pageId) {
        const generation = _docGeneration;
        const result = (await getMeasuresOnPage(_doc, pageId, _edition)) || [];
        if (generation !== _docGeneration) return result;
        const page = _pageIdToIndex.get(pageId);
        for (const m of result) {
            _measurePageIdCache.set(m.id, pageId);
            const rect = { ulx: Number(m.ulx), uly: Number(m.uly), lrx: Number(m.lrx), lry: Number(m.lry) };
            _navZones[m.id] = { page, ...rect };

            // One number per zone: part-wise sources list several measures (one per part) for the same zone.
            if (m.name) {
                const key = `measure:${m.zoneId ?? m.id}`;
                _overlayZones[key] = {
                    type: "measure", page, ...rect,
                    containerClass: "measure", innerClass: "measureInner",
                    label: String(m.name), group: key
                };
            }
        }
        pushZones();
        return result;
    }

    // Fetches the annotations on a page once and registers one badge zone per annotated region.
    function fetchAndCachePageAnnotations(pageId) {
        if (!_pageAnnotationsCache.has(pageId)) {
            _pageAnnotationsCache.set(pageId, loadPageAnnotations(pageId));
        }
        return _pageAnnotationsCache.get(pageId);
    }

    async function loadPageAnnotations(pageId) {
        const generation = _docGeneration;
        const annotations = (await getAnnotationsOnPage(_doc, pageId, _edition)) || [];
        if (generation !== _docGeneration) return annotations;
        const page = _pageIdToIndex.get(pageId);
        for (const annotation of annotations) {
            const categories = (annotation.categories || "").trim();
            const priority = (annotation.priority || "").trim();
            const iconHtml = categories.split(/\s+/).map(c => ANNOTATION_ICON_MARKUP[c]).find(Boolean) || "";
            for (const shape of annotation.plist || []) {
                const rect = [shape.ulx, shape.uly, shape.lrx, shape.lry];
                if (rect.some(v => v == null || v === "")) continue;
                // Annotations on the same region share a container, so their badges stack.
                const group = `annotation:${shape.id}`;
                _overlayZones[`${group}:${annotation.id}`] = {
                    type: "annotation", page,
                    ulx: Number(shape.ulx), uly: Number(shape.uly), lrx: Number(shape.lrx), lry: Number(shape.lry),
                    containerClass: "annotation",
                    innerClass: ["annotIcon", categories, priority, shape.type].filter(Boolean).join(" "),
                    iconHtml, group,
                    // zone-click reports this; it is the URI loadLinks needs to open the annotation.
                    dataId: annotation.uri,
                    filters: [categories, priority].filter(Boolean).join(" ")
                };
            }
        }
        pushZones();
        return annotations;
    }

    // Writes zones-data from the navigation and overlay zones. The key last navigated to is left out (see
    // _activeZoneKey) unless it is `targetKey`, which is about to be navigated to.
    function pushZones(targetKey = null) {
        const zones = {};
        for (const [key, zone] of Object.entries(_navZones)) {
            if (key === _activeZoneKey && key !== targetKey) continue;
            zones[key] = zone;
        }
        Object.assign(zones, _overlayZones);
        imageViewComponent.setAttribute("zones-data", JSON.stringify(zones));
    }

    // Navigates the viewer to a measure zone, after loading it if necessary.
    async function gotoZone(measureId) {
        await ensureZoneLoaded(measureId);
        await _imageReady;
        if (_viewMode !== "measure-view") return;
        if (!_navZones[measureId]) {
            console.warn(`Image view: no zone found for measure "${measureId}".`);
            return;
        }
        pushZones(measureId);
        imageViewComponent.setAttribute("zone", measureId);
        _activeZoneKey = measureId;
    }

    // Sets the size of the annotation badges (--badge-scale on the viewer, used by image-overlays.css).
    // Edirom-Frontend draws them at a fixed size, which suits a large screen. On a phone the whole page is only
    // a few hundred pixels wide, so full-size badges would cover the measures of a page view. The scale is the
    // same for all badges: small while the whole page is shown, growing with the square root of how far the user
    // has zoomed in (relative to the whole page), up to a maximum.
    function updateBadgeScale() {
        const viewport = imageViewComponent.openSeaDragon?.viewport;
        if (!viewport) return;
        const relativeZoom = viewport.getZoom(true) / viewport.getHomeZoom();
        if (!(relativeZoom > 0)) return;
        const scale = Math.min(BADGE_SCALE_MAX, Math.max(BADGE_SCALE_MIN, BADGE_SCALE_MIN * Math.sqrt(relativeZoom)));
        imageViewComponent.style.setProperty("--badge-scale", scale.toFixed(2));
    }
    imageViewComponent.style.setProperty("--badge-scale", String(BADGE_SCALE_MIN));
    imageViewComponent.addEventListener("zoom", updateBadgeScale);
    imageViewComponent.addEventListener("image-ready", updateBadgeScale);

    function applyVisibleTypes() {
        const types = [];
        if (_showMeasures) types.push("measure");
        if (_showAnnotations) types.push("annotation");
        imageViewComponent.setAttribute("visible-types", JSON.stringify(types));
    }

    // Loads the overlay data of the page the viewer shows, for the overlays that are switched on.
    async function loadOverlaysForCurrentPage() {
        const pageId = _fullPages[_viewerPageNumber - 1]?.id;
        if (!pageId) return;
        const loads = [];
        if (_showMeasures) loads.push(fetchAndCachePageMeasures(pageId));
        if (_showAnnotations) loads.push(fetchAndCachePageAnnotations(pageId));
        await Promise.all(loads);
    }

    // --- activatePageView ---
    async function activatePageView(targetPageId) {
        _viewMode = "page-view";
        _sequenceData = _pageSequenceData;
        _labels = _pageLabels;

        let idx = 0;
        if (targetPageId) {
            const found = _pageSequenceData.findIndex(s => s.id === targetPageId);
            if (found !== -1) idx = found;
        }
        _currentSequenceIndex = idx;

        spinBox.setAttribute("label", getLangString("mobile.ImageView_page", "Page"));
        spinBox.setAttribute("steps-data", JSON.stringify(_pageLabels));
        spinBox.setAttribute("current-step", _pageLabels[idx]);
        viewModeButton.setAttribute("current-state", "page-view");

        const pageNumber = String(_pageIdToIndex.get(_pageSequenceData[idx].id));
        await _imageReady;
        if (_viewMode !== "page-view") return;
        imageViewComponent.setAttribute("pagenumber", pageNumber);
    }

    // --- activateMeasureView ---
    async function activateMeasureView(targetMeasureIndex, targetMeasureId) {
        _viewMode = "measure-view";

        // Fetch measures once and cache
        if (_measuresData === null && _movements.length > 0) {
            _measuresData = await getMeasures(_doc, _edition, _movements[0].id);
        }
        if (!_measuresData || _measuresData.length === 0) return;

        // Build measure sequence from effective (possibly filtered) data
        const effective = getEffectiveMeasuresData();
        if (effective.length === 0) return;

        _measureSequenceData = effective.map(group => ({
            type: "zone",
            id: group.measures[0].id
        }));
        _measureLabels = effective.map(group => group.name);

        _sequenceData = _measureSequenceData;
        _labels = _measureLabels;

        // Resolve target index: prefer ID lookup, fall back to numeric index, then 0.
        let idx = -1;
        if (targetMeasureId) {
            idx = _measureSequenceData.findIndex(s => s.id === targetMeasureId);
        }
        if (idx === -1 && targetMeasureIndex != null) {
            idx = targetMeasureIndex;
        }
        if (idx < 0 || idx >= _measureSequenceData.length) idx = 0;
        _currentSequenceIndex = idx;

        spinBox.setAttribute("label", getLangString("view.window.source.SourceView_GotoMsg_Measure", "Measure"));
        spinBox.setAttribute("steps-data", JSON.stringify(_measureLabels));
        spinBox.setAttribute("current-step", _measureLabels[idx]);
        viewModeButton.setAttribute("current-state", "measure-view");

        // Ensure zone is loaded and navigate
        const step = _measureSequenceData[idx];
        await gotoZone(step.id);
    }

    // --- ensureZoneLoaded ---
    async function ensureZoneLoaded(measureId) {
        if (_navZones[measureId]) return;

        // Try bulk-fetch via cached pageId
        const cachedPageId = _measurePageIdCache.get(measureId);
        if (cachedPageId) {
            await fetchAndCachePageMeasures(cachedPageId);
            return;
        }

        // Fallback: single getMeasurePage, then bulk-cache siblings
        const data = await getMeasurePage(_doc, _edition, measureId);
        if (data && data.length > 0) {
            _measurePageIdCache.set(measureId, data[0].pageId);
            await fetchAndCachePageMeasures(data[0].pageId);
        }
    }

    // --- switchViewMode ---
    async function switchViewMode(newMode) {
        if (newMode === _viewMode) return;

        if (newMode === "measure-view") {
            // Page → Measure: find first measure on current page
            const currentPageStep = _pageSequenceData[_currentSequenceIndex];
            const currentPageId = currentPageStep ? currentPageStep.id : null;

            // Ensure measures are fetched
            if (_measuresData === null && _movements.length > 0) {
                _measuresData = await getMeasures(_doc, _edition, _movements[0].id);
            }
            if (!_measuresData || _measuresData.length === 0) return;

            // Build measure sequence if not yet built
            if (_measureSequenceData.length === 0) {
                const effective = getEffectiveMeasuresData();
                _measureSequenceData = effective.map(group => ({
                    type: "zone",
                    id: group.measures[0].id
                }));
                _measureLabels = effective.map(group => group.name);
            }

            // Single bulk fetch: get all measures on the current page
            let targetIdx = -1;
            if (currentPageId) {
                const pageMeasures = await fetchAndCachePageMeasures(currentPageId);
                const onPageIds = new Set(pageMeasures.map(m => m.id));
                targetIdx = _measureSequenceData.findIndex(s => onPageIds.has(s.id));
            }
            if (targetIdx === -1) targetIdx = 0;

            await activateMeasureView(targetIdx);

        } else if (newMode === "page-view") {
            // Measure → Page: use pageId from last measure's cached response
            const currentMeasureStep = _measureSequenceData[_currentSequenceIndex];
            let targetPageId = null;
            if (currentMeasureStep) {
                targetPageId = _measurePageIdCache.get(currentMeasureStep.id);
            }
            activatePageView(targetPageId);
        }
    }

    // --- setData ---
    // Called by views.js applyViewData / applyCurrentViewFilterState with either
    // mainData or subsetData.  Tile sources, zones-data, _pageIdToIndex, and
    // measure caches are set once in update() and survive filter toggles.
    // isNavigationUpdate is true when called from a concordance connection switch
    // or any other navigation event; false (default) for filter-state toggles.
    function setData({ pages, movements, measureSubsetIds, jumpMeasureId }, { isNavigationUpdate = false } = {}) {
        // Capture current state before rebuilding sequences
        const wasInitialized = _sequenceData.length > 0;
        const previousViewMode = _viewMode;
        const previousStep = _sequenceData[_currentSequenceIndex] || null;

        _pages = pages;
        _movements = movements;
        _activeMeasureSubsetIds = measureSubsetIds || null;

        // Clear lazily-built measure sequences (rebuilt by activateMeasureView)
        _measureSequenceData = [];
        _measureLabels = [];

        // Build page sequence from the (possibly filtered) pages
        _pageSequenceData = pages.map(page => ({ type: "page", id: page.id }));
        _pageLabels = pages.map(page => page.name);

        // Show/hide toggle based on movements availability
        if (movements && movements.length > 0) {
            viewModeButton.classList.remove("hidden");
        } else {
            viewModeButton.classList.add("hidden");
        }

        if (!wasInitialized || isNavigationUpdate) {
            // First load or concordance connection switch: derive view mode from subset.
            // Subset present → measure view; single-ID jump → measure view on that
            // measure, unrestricted; whole-document connection → page view.
            if (_activeMeasureSubsetIds) {
                activateMeasureView(0);
            } else if (jumpMeasureId) {
                activateMeasureView(null, jumpMeasureId);
            } else {
                activatePageView();
            }
        } else {
            // Filter toggle: preserve view mode, stay on current item if still valid.
            if (previousViewMode === "measure-view") {
                const targetId = previousStep && previousStep.type === "zone" ? previousStep.id : null;
                activateMeasureView(null, targetId);
            } else {
                const targetPageId = previousStep && previousStep.type === "page" ? previousStep.id : null;
                activatePageView(targetPageId);
            }
        }
    }

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update: async (target) => {
            const { doc, ids } = splitTargetIntoDocAndIds(target);
            console.log("Updating image view with doc:", doc, "and ids:", ids);

            // Detect whether the document and edition are the same as the current state.
            // If so we can skip re-initialising the OSD viewer (which is expensive and
            // causes a WebGL context loss + full tile reload) and only recompute the subset.
            const isSameDoc = doc === _doc && appState.edition.doc === _edition && _fullPages.length > 0;

            _doc = doc;
            _edition = appState.edition.doc;

            if (!isSameDoc) {
                // --- Full load for a new document ---

                // Reset all caches on each update (new data load)
                _measuresData = null;
                _measureSequenceData = [];
                _measureLabels = [];
                _measurePageIdCache = new Map();
                _pageMeasuresCache = new Map();
                _pageAnnotationsCache = new Map();
                _navZones = {};
                _overlayZones = {};
                _activeZoneKey = null;
                _docGeneration++;

                const [pagesData, movementsData] = await Promise.all([
                    getPages(doc, _edition),
                    getMovements(doc, _edition)
                ]);

                if (!pagesData || pagesData.length === 0) return { mainData: null, subsetData: null };

                const movements = movementsData || [];
                _fullPages = pagesData;
                _fullMovements = movements;

                // Build _pageIdToIndex from ALL pages (needed for OSD page numbers)
                _pageIdToIndex = new Map(pagesData.map((page, index) => [page.id, index + 1]));

                // Build tile sources from ALL pages, for the edition's image server
                const imagePrefix = getPreference("image_prefix");
                const imageSettings = {
                    imageServer: getPreference("image_server"),
                    imagePrefix: imagePrefix == null ? undefined : resolveImagePrefix(imagePrefix, getFrontendBaseUrl())
                };
                const tileSources = pagesData.map(page =>
                    buildTileSource(page.path, page.width, page.height, imageSettings));

                // Clear the viewer's zones before it is rebuilt, so that its old active zone cannot be
                // applied to the new document.
                _viewerPageNumber = 1;
                imageViewComponent.setAttribute("zones-data", "{}");

                // Setting tilesources re-initialises the OSD viewer, so only do it when the
                // document actually changes.
                resetImageReady();
                imageViewComponent.setAttribute("tilesources", JSON.stringify(tileSources));
            }

            // --- Subset logic ---
            // The subset is always built for any non-empty ids, so the user can
            // manually activate filtered mode even for a single-ID target (see
            // views.js applyViewData's defaultFiltered). jumpMeasureId separately
            // carries where to land when a single-ID target starts unfiltered.
            let subsetData = null;
            let jumpMeasureId = null;
            if (ids.length > 0 && _fullMovements.length > 0) {
                // For same-doc switches reuse the already-cached measures list; only fetch
                // when we don't have it yet (first load or after a different-doc reset).
                if (_measuresData === null) {
                    _measuresData = await getMeasures(doc, _edition, _fullMovements[0].id);
                }
                if (_measuresData && _measuresData.length > 0) {
                    const idsSet = new Set(ids);
                    // A group matches if any of its measures has an ID in the target
                    const matchingGroups = _measuresData.filter(group =>
                        group.measures.some(m => idsSet.has(m.id))
                    );
                    if (matchingGroups.length > 0) {
                        const matchingPrimaryIds = matchingGroups.map(g => g.measures[0].id);

                        if (ids.length === 1) {
                            jumpMeasureId = matchingPrimaryIds[0];
                        }

                        // Determine which pages contain the matching measures.
                        // For same-doc switches most entries will already be in the cache —
                        // only fetch the ones that aren't.
                        const uncached = matchingPrimaryIds.filter(mId => !_measurePageIdCache.has(mId));
                        if (uncached.length > 0) {
                            const pageResults = await Promise.all(
                                uncached.map(mId => getMeasurePage(doc, _edition, mId))
                            );
                            for (let i = 0; i < uncached.length; i++) {
                                const data = pageResults[i];
                                if (data && data.length > 0) {
                                    _measurePageIdCache.set(uncached[i], data[0].pageId);
                                }
                            }
                        }

                        const relevantPageIds = new Set(
                            matchingPrimaryIds
                                .map(mId => _measurePageIdCache.get(mId))
                                .filter(Boolean)
                        );

                        const filteredPages = _fullPages.filter(p => relevantPageIds.has(p.id));
                        if (filteredPages.length > 0) {
                            subsetData = { pages: filteredPages, movements: _fullMovements, measureSubsetIds: matchingPrimaryIds };
                        }
                    }
                }
            }

            const mainData = { pages: _fullPages, movements: _fullMovements, jumpMeasureId };
            return { mainData, subsetData };
        },
        setData
    };
}
