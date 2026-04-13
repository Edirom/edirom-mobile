import { appState } from "./config.js";
import { getPages, getMovements, getMeasures, getMeasurePage, getMeasuresOnPage } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

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
    const imageViewComponent = document.createElement("edirom-openseadragon");
    imageViewComponent.classList.add("web-component");
    // Sequence mode: OSD shows one page at a time and only loads that page's
    // tiles – the same as the desktop viewer which calls showImage() once per page.
    imageViewComponent.setAttribute("sequencemode", "true");
    // Hide OSD's built-in sequence controls; the spin box handles navigation.
    imageViewComponent.setAttribute("showsequencecontrol", "false");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(imageViewComponent);

    // --- Closure state ---
    let _pages = [];
    let _movements = [];
    let _pageIdToIndex = new Map();   // pageId → 1-based OSD pageNumber

    // Page mode
    let _pageSequenceData = [];       // [{ type: "page", id: pageId }]
    let _pageLabels = [];

    // Measure mode
    let _measureSequenceData = [];    // [{ type: "zone", id: measureXmlId }]
    let _measureLabels = [];
    let _measuresData = null;         // cached getMeasures response
    let _measurePageIdCache = new Map(); // measureXmlId → pageId
    let _pageMeasuresCache = new Map();  // pageId → getMeasuresOnPage response

    // Active sequence (points to page or measure)
    let _sequenceData = [];
    let _labels = [];
    let _currentSequenceIndex = 0;
    let _viewMode = "page-view";

    // Doc/edition for lazy API calls (set in update)
    let _doc = "";
    let _edition = "";

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");

    // PAGE STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "image-step-spin-box";
    spinBox.setAttribute("label", "Seite");

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
            await ensureZoneLoaded(step.id);
            imageViewComponent.setAttribute("zone", step.id);
        }
    });

    // Viewer → spin box: update spin box only via viewer feedback events.
    imageViewComponent.addEventListener("page-changed", (event) => {
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
    // [ spacer ] [ viewModeButton ] [ spinBox ]
    controlBar.appendChild(spacer);
    controlBar.appendChild(viewModeButton);
    controlBar.appendChild(spinBox);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    // --- fetchAndCachePageMeasures ---
    async function fetchAndCachePageMeasures(pageId) {
        if (_pageMeasuresCache.has(pageId)) return _pageMeasuresCache.get(pageId);
        const measures = await getMeasuresOnPage(_doc, pageId, _edition);
        const result = measures || [];
        _pageMeasuresCache.set(pageId, result);
        const page = _pageIdToIndex.get(pageId);
        const zonesData = JSON.parse(imageViewComponent.getAttribute("zones-data") || "{}");
        for (const m of result) {
            _measurePageIdCache.set(m.id, pageId);
            zonesData[m.id] = {
                page,
                ulx: Number(m.ulx),
                uly: Number(m.uly),
                lrx: Number(m.lrx),
                lry: Number(m.lry)
            };
        }
        imageViewComponent.setAttribute("zones-data", JSON.stringify(zonesData));
        return result;
    }

    // --- activatePageView ---
    function activatePageView(targetPageId) {
        _viewMode = "page-view";
        _sequenceData = _pageSequenceData;
        _labels = _pageLabels;

        let idx = 0;
        if (targetPageId) {
            const found = _pageSequenceData.findIndex(s => s.id === targetPageId);
            if (found !== -1) idx = found;
        }
        _currentSequenceIndex = idx;

        spinBox.setAttribute("label", "Seite");
        spinBox.setAttribute("steps-data", JSON.stringify(_pageLabels));
        spinBox.setAttribute("current-step", _pageLabels[idx]);
        imageViewComponent.setAttribute("pagenumber", String(_pageIdToIndex.get(_pageSequenceData[idx].id)));
        viewModeButton.setAttribute("current-state", "page-view");
    }

    // --- activateMeasureView ---
    async function activateMeasureView(targetMeasureIndex) {
        _viewMode = "measure-view";

        // Fetch measures once and cache
        if (_measuresData === null && _movements.length > 0) {
            _measuresData = await getMeasures(_doc, _edition, _movements[0].id);
        }
        if (!_measuresData || _measuresData.length === 0) return;

        // Build measure sequence
        _measureSequenceData = _measuresData.map(group => ({
            type: "zone",
            id: group.measures[0].id
        }));
        _measureLabels = _measuresData.map(group => group.name);

        _sequenceData = _measureSequenceData;
        _labels = _measureLabels;

        let idx = targetMeasureIndex != null ? targetMeasureIndex : 0;
        if (idx < 0 || idx >= _measureSequenceData.length) idx = 0;
        _currentSequenceIndex = idx;

        spinBox.setAttribute("label", "Takt");
        spinBox.setAttribute("steps-data", JSON.stringify(_measureLabels));
        spinBox.setAttribute("current-step", _measureLabels[idx]);
        viewModeButton.setAttribute("current-state", "measure-view");

        // Ensure zone is loaded and navigate
        const step = _measureSequenceData[idx];
        await ensureZoneLoaded(step.id);
        imageViewComponent.setAttribute("zone", step.id);
    }

    // --- ensureZoneLoaded ---
    async function ensureZoneLoaded(measureId) {
        // Check if zone already in viewer's zones-data
        const existing = JSON.parse(imageViewComponent.getAttribute("zones-data") || "{}");
        if (existing[measureId]) return;

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
                _measureSequenceData = _measuresData.map(group => ({
                    type: "zone",
                    id: group.measures[0].id
                }));
                _measureLabels = _measuresData.map(group => group.name);
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
    function setData({ pages, movements }) {
        _pages = pages;
        _movements = movements;

        // Reset measure cache when data changes
        _measuresData = null;
        _measureSequenceData = [];
        _measureLabels = [];
        _measurePageIdCache = new Map();
        _pageMeasuresCache = new Map();

        // Build tile sources for OSD
        let tileSources = pages.map(page => {
            if (page.path && page.path.startsWith("http")) {
                return {
                    "@context": "http://iiif.io/api/image/2/context.json",
                    "@id": page.path,
                    "height": Number(page.height),
                    "width": Number(page.width),
                    "profile": ["http://iiif.io/api/image/2/level2.json"],
                    "protocol": "http://iiif.io/api/image",
                    "tiles": [{ "scaleFactors": [1, 2, 4, 8, 16, 32], "width": 1024 }]
                };
            }
            return page.path;
        });
        imageViewComponent.setAttribute("tilesources", JSON.stringify(tileSources));
        imageViewComponent.setAttribute("zones-data", "{}");

        // Build page sequence
        _pageIdToIndex = new Map(pages.map((page, index) => [page.id, index + 1]));
        _pageSequenceData = pages.map(page => ({ type: "page", id: page.id }));
        _pageLabels = pages.map(page => page.name);

        // Show/hide toggle based on movements availability
        if (movements && movements.length > 0) {
            viewModeButton.classList.remove("hidden");
        } else {
            viewModeButton.classList.add("hidden");
        }

        // Always start in page view
        activatePageView();
    }

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update: (target) => {
            const { doc } = splitTargetIntoDocAndIds(target);
            _doc = doc;
            _edition = appState.edition.doc;
            return updateImageViewWebComponent(target, imageViewComponent);
        },
        setData
    };
}

/**
 * Fetches pages and movements for the given target URI in parallel.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {HTMLElement} imageViewComponent - The image viewer web component
 * @returns {Promise<{ mainData: { pages: Object[], movements: Object[] }|null, subsetData: null }>}
 */
async function updateImageViewWebComponent(target, imageViewComponent) {
    const { doc } = splitTargetIntoDocAndIds(target);

    const [pagesData, movementsData] = await Promise.all([
        getPages(doc, appState.edition.doc),
        getMovements(doc, appState.edition.doc)
    ]);

    if (!pagesData || pagesData.length === 0) return { mainData: null, subsetData: null };

    return { mainData: { pages: pagesData, movements: movementsData || [] }, subsetData: null };
}
