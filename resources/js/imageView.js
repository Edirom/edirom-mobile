import { appState } from "./config.js";
import { getLangString } from "./languageController.js";
import { getPages, getMovements, getMeasures, getMeasurePage, getMeasure, getParts } from "./api.js";
import { getPreference } from "./preferenceController.js";
import { buildTileSource, resolveImagePrefix } from "./imageServer.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { createImageDocument, createViewerSession } from "./imageViewerSession.js";
import { createMeasureStack } from "./measureStackView.js";
import { hasVoices, findGroupIndex, matchingGroups, defaultVoiceSelection } from "./measureVoices.js";

// Overlay toggles (measure numbers, annotations) are remembered for the browser session: a freshly built image
// view starts with whatever the user last chose, in whichever document. sessionStorage ends with the browser
// session; the module variable keeps the choice within the page where storage is blocked.
const OVERLAY_STORAGE_KEY = "edirom-mobile.imageView.overlays";
let _sessionOverlays = null;

function readSessionOverlays() {
    if (_sessionOverlays) return _sessionOverlays;
    let stored = null;
    try {
        stored = JSON.parse(sessionStorage.getItem(OVERLAY_STORAGE_KEY));
    } catch (e) { /* storage unavailable or malformed: fall back to the defaults */ }
    _sessionOverlays = { measures: stored?.measures === true, annotations: stored?.annotations === true };
    return _sessionOverlays;
}

function writeSessionOverlays(overlays) {
    _sessionOverlays = overlays;
    try {
        sessionStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(overlays));
    } catch (e) { /* storage unavailable: the module variable still holds it */ }
}

// The voice selection of the measure-based view is remembered per source document for the browser session
// (like Edirom-Frontend it applies to all movements of the source), with the same fallback as the overlays.
const VOICE_STORAGE_KEY = "edirom-mobile.imageView.voices";
let _sessionVoices = null;

function readStoredVoices(doc) {
    if (!_sessionVoices) {
        let stored = null;
        try {
            stored = JSON.parse(sessionStorage.getItem(VOICE_STORAGE_KEY));
        } catch (e) { /* storage unavailable or malformed */ }
        _sessionVoices = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    }
    return Array.isArray(_sessionVoices[doc]) ? _sessionVoices[doc] : null;
}

function writeStoredVoices(doc, voiceIds) {
    readStoredVoices(doc);
    _sessionVoices[doc] = voiceIds;
    try {
        sessionStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(_sessionVoices));
    } catch (e) { /* storage unavailable: the module variable still holds it */ }
}

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
 *
 * Page view and the measure view of a score use one viewer over all pages. The measure view of a part-wise
 * source shows one row per selected voice instead (measureStackView.js), and offers the voice selection.
 * Sources with several movements (mdivs) get a movement selector in measure view.
 *
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config (currently unused)
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, controlBarWidget: HTMLElement, update: function, setData: function }}
 */
export function buildImageView(target, config = {}) {
    // Host stylesheets that are cloned into the viewers' shadow roots: the measure number / annotation badge
    // rules of the Frontend, Mobile's touch adjustments, and the edition's own CSS (like Edirom-Frontend).
    const overlayStylesheets = [
        new URL("resources/css/annotation-style.css", getFrontendBaseUrl()).href,
        new URL("resources/css/image-overlays.css", document.baseURI).href
    ];
    const additionalCssPath = getPreference("additional_css_path");
    if (typeof additionalCssPath === "string" && additionalCssPath.includes("/db/")) {
        overlayStylesheets.push(new URL(additionalCssPath.split("/db/")[1], getFrontendBaseUrl()).href);
    }

    function configureViewer(viewer, { stacked = false } = {}) {
        // Sequence mode: OSD shows one page at a time and only loads that page's
        // tiles – the same as the desktop viewer which calls showImage() once per page.
        viewer.setAttribute("sequencemode", "true");
        // Hide OSD's built-in sequence controls; the spin box handles navigation.
        viewer.setAttribute("showsequencecontrol", "false");
        viewer.setAttribute("overlay-stylesheets", JSON.stringify(overlayStylesheets));
        // The stacked voice viewers draw on a 2D canvas: one WebGL context each would soon exceed the browser's
        // limit of live contexts (a split measure in five voices is ten viewers).
        if (stacked) viewer.setAttribute("openseadragon-options", JSON.stringify({ drawer: "canvas" }));
    }

    // Overlay toggles, taken over from the browser session (see readSessionOverlays)
    const imageDoc = createImageDocument({
        showMeasures: readSessionOverlays().measures,
        showAnnotations: readSessionOverlays().annotations
    });

    const imageViewComponent = document.createElement("edirom-image-viewer");
    imageViewComponent.classList.add("web-component");
    configureViewer(imageViewComponent);
    const mainSession = createViewerSession(imageViewComponent, imageDoc);

    const measureStack = createMeasureStack({
        imageDoc,
        configureViewer: viewer => configureViewer(viewer, { stacked: true }),
        emptyMessage: getLangString("mobile.ImageView_noMeasureInSelectedVoices", "No measure in the selected parts")
    });
    measureStack.element.classList.add("display-none");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(imageViewComponent);
    content.appendChild(measureStack.element);

    // --- Closure state ---
    let _pages = [];
    let _movements = [];

    // Full data (set once in update, survives filter toggles)
    let _fullPages = [];
    let _fullMovements = [];

    // Page mode
    let _pageSequenceData = [];       // [{ type: "page", id: pageId }]
    let _pageLabels = [];

    // Measure mode
    let _measureSequenceData = [];    // [{ type: "zone", id: groupId, zoneId: first measure's xml:id, group }]
    let _measureLabels = [];
    let _measuresByMdiv = new Map();  // mdivId → Promise of getMeasures response
    let _currentMdivId = null;
    let _voiceMode = false;           // the current movement's measures belong to voices (part-wise source)

    // Voices (part-wise sources)
    let _partsPromise = null;
    let _parts = [];
    let _selectedVoices = null;

    // Subset state: group ids of the active subset and the movement they belong to, or null
    let _activeMeasureSubsetIds = null;
    let _subsetMdivId = null;

    // Active sequence (points to page or measure)
    let _sequenceData = [];
    let _labels = [];
    let _currentSequenceIndex = 0;
    let _viewMode = "page-view";

    // Counts view activations, so that a slow measure-view activation does not override a later one.
    let _viewNavigation = 0;

    // State to bring back with the next setData call (see restoreState), or null
    let _pendingRestore = null;

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");

    // PAGE STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "image-step-spin-box";
    spinBox.setAttribute("label", getLangString("mobile.ImageView_page", "Page"));

    // Spin box → viewer: only set attribute on component, never update spin box directly (the stacked voice
    // rows have no single viewer that could report back, so there the step is confirmed by the host).
    spinBox.addEventListener("spin-box-step-requested", async (event) => {
        const label = event.detail.requestedStep;
        const idx = findNearestIndex(_labels, label, _currentSequenceIndex);
        if (idx === -1) return;
        _currentSequenceIndex = idx;
        const step = _sequenceData[idx];
        if (step.type === "page") {
            mainSession.setPage(imageDoc.pageIdToIndex.get(step.id));
        } else if (step.type === "zone") {
            await gotoMeasureStep(idx);
        }
    });

    // Viewer → spin box: update spin box only via viewer feedback events.
    imageViewComponent.addEventListener("page-changed", (event) => {
        if (_viewMode !== "page-view") return;
        const pageNumber = event.detail.pageNumber;
        const idx = _sequenceData.findIndex(
            s => s.type === "page" && imageDoc.pageIdToIndex.get(s.id) === pageNumber
        );
        if (idx !== -1) {
            _currentSequenceIndex = idx;
            spinBox.setAttribute("current-step", _labels[idx]);
        }
    });

    imageViewComponent.addEventListener("zone-changed", (event) => {
        if (_viewMode !== "measure-view" || _voiceMode) return;
        const { zoneKey } = event.detail;
        const idx = _sequenceData.findIndex(s => s.type === "zone" && s.zoneId === zoneKey);
        if (idx !== -1) {
            _currentSequenceIndex = idx;
            spinBox.setAttribute("current-step", _labels[idx]);
        }
    });

    // --- Overlay toggle buttons (measure numbers, annotations) ---
    // Like the toggle buttons of Edirom-Frontend, they keep their icon and show whether they are switched on
    // by their background: both states have the same icon, and styles.css colours `current-state="on"`.
    function buildToggleButton(buttonId, iconName, titleKey, titleFallback, overlayKey) {
        const button = document.createElement("edirom-button-widget");
        button.id = buttonId;
        button.setAttribute("states-data", JSON.stringify([
            { name: "off", iconName },
            { name: "on", iconName }
        ]));
        button.setAttribute("current-state", imageDoc.overlays[overlayKey] ? "on" : "off");
        button.title = getLangString(titleKey, titleFallback);
        button.addEventListener("button-state-requested", (event) => {
            event.stopPropagation();
            const requestedState = event.detail.requestedState;
            button.setAttribute("current-state", requestedState);
            imageDoc.overlays[overlayKey] = requestedState === "on";
            writeSessionOverlays({ measures: imageDoc.overlays.showMeasures, annotations: imageDoc.overlays.showAnnotations });
            mainSession.applyVisibleTypes();
            mainSession.loadOverlaysForCurrentPage();
            measureStack.applyOverlays();
        });
        return button;
    }

    const measureToggleButton = buildToggleButton(
        "image-measure-toggle-button", "eo_toggle_measures",
        "view.window.source.SourceView_showMeasures", "Show/hide measures", "showMeasures");

    const annotationToggleButton = buildToggleButton(
        "image-annotation-toggle-button", "eo_toggle_annotations",
        "view.window.source.SourceView_showAnnotations", "Show/hide annotations", "showAnnotations");

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

    // --- Movement selector (measure view, sources with several movements) ---
    const mdivSelect = document.createElement("edirom-select-widget");
    mdivSelect.id = "image-mdiv-select";
    mdivSelect.classList.add("display-none");
    mdivSelect.setAttribute("label", getLangString("view.window.source.SourceView_GotoMsg_MovmentNumber", "Movement"));
    mdivSelect.setAttribute("accessible-label",
        getLangString("view.window.source.SourceView_MeasureBasedView_movementSelectorBox", "Select movement"));
    mdivSelect.addEventListener("select-value-requested", (event) => {
        const mdivId = event.detail.requestedValue;
        if (!mdivId || mdivId === _currentMdivId) return;
        // The select shows the confirmed movement until the new one's measures are there (activateMeasureView).
        activateMeasureView({ mdivId, index: 0 });
    });

    // --- Voice selection (measure view, part-wise sources) ---
    const voiceSelect = document.createElement("edirom-multi-select-widget");
    voiceSelect.id = "image-voice-select";
    voiceSelect.classList.add("display-none");
    voiceSelect.setAttribute("icon", "eo_voice_filter");
    voiceSelect.setAttribute("label", getLangString("view.window.source.SourceView_MeasureBasedView_selectVoices", "Select parts"));
    voiceSelect.setAttribute("select-all-label", getLangString("mobile.ImageView_selectAllVoices", "All parts"));
    voiceSelect.setAttribute("close-label", getLangString("view.desktop.Desktop_Close", "Close"));
    voiceSelect.setAttribute("min-selected", "1");
    voiceSelect.setAttribute("layout-mode", "mobile");
    voiceSelect.addEventListener("multi-select-values-requested", (event) => {
        const values = event.detail.requestedValues;
        if (!values.length) return;
        _selectedVoices = values;
        voiceSelect.setAttribute("selected-values", JSON.stringify(values));
        writeStoredVoices(imageDoc.doc, values);
        if (_viewMode === "measure-view" && _voiceMode) gotoMeasureStep(_currentSequenceIndex);
    });
    // The back button/gesture first closes an open voice sheet (see pages.js requestComponentsBackHandling).
    voiceSelect.setAttribute("data-handles-back-request", "");
    voiceSelect.addEventListener("back-request", (event) => {
        if (voiceSelect.open) {
            event.preventDefault();
            voiceSelect.hide?.();
        }
    });

    // --- Control bar layout ---
    // [ spacer ] [ measureToggle ] [ annotationToggle ] [ viewModeButton ] [ mdivSelect ] [ voiceSelect ] [ spinBox ]
    controlBar.appendChild(spacer);
    controlBar.appendChild(measureToggleButton);
    controlBar.appendChild(annotationToggleButton);
    controlBar.appendChild(viewModeButton);
    controlBar.appendChild(mdivSelect);
    controlBar.appendChild(voiceSelect);
    controlBar.appendChild(spinBox);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    // --- Measures per movement ---
    function loadMeasures(mdivId) {
        if (!mdivId) return Promise.resolve([]);
        if (!_measuresByMdiv.has(mdivId)) {
            const request = getMeasures(imageDoc.doc, imageDoc.edition, mdivId).then(data => {
                // A failed request is not cached, so that the next activation tries again.
                if (!Array.isArray(data)) _measuresByMdiv.delete(mdivId);
                return Array.isArray(data) ? data : [];
            });
            _measuresByMdiv.set(mdivId, request);
        }
        return _measuresByMdiv.get(mdivId);
    }

    // The movement a measure reference belongs to: from the movements loaded so far, else from the backend
    // (getMeasure.xql knows real and virtual measure ids), else the current or first movement.
    async function resolveMovementId(reference) {
        for (const [mdivId, request] of _measuresByMdiv) {
            if (findGroupIndex(await request, reference) !== -1) return mdivId;
        }
        if (reference) {
            const result = await getMeasure(imageDoc.doc, imageDoc.edition, reference);
            if (result?.movementId && _fullMovements.some(m => m.id === result.movementId)) return result.movementId;
        }
        return _currentMdivId ?? _fullMovements[0]?.id ?? null;
    }

    // The parts of the source, fetched once per document the first time a part-wise measure view opens.
    function ensureParts() {
        if (!_partsPromise) {
            const doc = imageDoc.doc;
            _partsPromise = getParts(imageDoc.doc, imageDoc.edition).then(parts => {
                if (doc !== imageDoc.doc) return _parts;
                _parts = Array.isArray(parts) ? parts : [];
                _selectedVoices = defaultVoiceSelection(_parts, readStoredVoices(doc));
                voiceSelect.setAttribute("options-data", JSON.stringify(_parts.map(p => ({ value: p.id, label: p.label }))));
                voiceSelect.setAttribute("selected-values", JSON.stringify(_selectedVoices));
                return _parts;
            });
        }
        return _partsPromise;
    }

    // Returns the measures of the current movement, filtered to the active subset if it belongs to it.
    function getEffectiveMeasuresData(measuresData) {
        if (!_activeMeasureSubsetIds || _subsetMdivId !== _currentMdivId) return measuresData;
        const subsetSet = new Set(_activeMeasureSubsetIds);
        return measuresData.filter(group => subsetSet.has(group.id));
    }

    // Shows or hides the widgets and viewers that belong to a view mode.
    function updateModeUi() {
        const measureView = _viewMode === "measure-view";
        const stacked = measureView && _voiceMode;
        imageViewComponent.classList.toggle("display-none", stacked);
        measureStack.element.classList.toggle("display-none", !stacked);
        if (!stacked) measureStack.clear();
        const showMdivSelect = measureView && _movements.length > 1;
        mdivSelect.classList.toggle("display-none", !showMdivSelect);
        // The bar is full with the movement selector; a smaller gap leaves it room for a few letters.
        controlBar.setAttribute("gap", showMdivSelect ? "4px" : "10px");
        voiceSelect.classList.toggle("display-none", !(stacked && _parts.length > 1));
        if (!stacked) voiceSelect.hide?.();
    }

    // --- gotoMeasureStep ---
    // Shows the measure of a step: in the voice rows, or as a zone jump of the single viewer.
    async function gotoMeasureStep(idx) {
        const step = _measureSequenceData[idx];
        if (!step) return;
        if (_voiceMode) {
            mainSession.bumpNavigation();
            spinBox.setAttribute("current-step", _measureLabels[idx]);
            await measureStack.showGroup(step.group, _parts, _selectedVoices);
        } else if (step.zoneId) {
            await mainSession.gotoZone(step.zoneId, { isCurrent: () => _viewMode === "measure-view" && !_voiceMode });
        }
    }

    // --- activatePageView ---
    async function activatePageView(targetPageId) {
        _viewNavigation++;
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
        updateModeUi();

        // Set at once: the viewer opens on a page requested before it exists, so there is nothing to wait for
        // (and a late write would undo a page the user has stepped to in the meantime).
        const step = _pageSequenceData[idx];
        if (step) mainSession.setPage(imageDoc.pageIdToIndex.get(step.id));
    }

    // --- activateMeasureView ---
    // Opens the measure view on a movement (default: the current, else the first one) at the first group found
    // for `references` (measure ids in any form), else at `index`, else at the first group.
    // Returns true when shown, false when the movement has no measures, null when superseded meanwhile.
    async function activateMeasureView({ mdivId = null, references = [], index = null } = {}) {
        const navigation = ++_viewNavigation;
        const targetMdivId = mdivId || _currentMdivId || _movements[0]?.id || null;
        const measuresData = await loadMeasures(targetMdivId);
        if (navigation !== _viewNavigation) return null;
        if (measuresData.length === 0) return false;

        const voiceMode = hasVoices(measuresData);
        if (voiceMode) {
            await ensureParts();
            if (navigation !== _viewNavigation) return null;
        }

        _currentMdivId = targetMdivId;
        const effective = getEffectiveMeasuresData(measuresData);
        if (effective.length === 0) return false;

        _viewMode = "measure-view";
        _voiceMode = voiceMode;
        _measureSequenceData = effective.map(group => ({
            type: "zone",
            id: group.id,
            zoneId: group.measures?.[0]?.id,
            group
        }));
        _measureLabels = effective.map(group => String(group.name));
        _sequenceData = _measureSequenceData;
        _labels = _measureLabels;

        // Resolve target index: prefer a reference, fall back to the numeric index, then 0.
        let idx = -1;
        for (const reference of references) {
            idx = findGroupIndex(effective, reference);
            if (idx !== -1) break;
        }
        if (idx === -1 && index != null) idx = index;
        if (idx < 0 || idx >= _measureSequenceData.length) idx = 0;
        _currentSequenceIndex = idx;

        spinBox.setAttribute("label", getLangString("view.window.source.SourceView_GotoMsg_Measure", "Measure"));
        spinBox.setAttribute("steps-data", JSON.stringify(_measureLabels));
        spinBox.setAttribute("current-step", _measureLabels[idx]);
        viewModeButton.setAttribute("current-state", "measure-view");
        mdivSelect.setAttribute("value", _currentMdivId);
        updateModeUi();

        await gotoMeasureStep(idx);
        return true;
    }

    // --- switchViewMode ---
    async function switchViewMode(newMode) {
        if (newMode === _viewMode) return;

        if (newMode === "measure-view") {
            // Page → Measure: start at the first measure on the current page, in its movement.
            const currentPageId = _pageSequenceData[_currentSequenceIndex]?.id ?? null;
            let references = [];
            if (currentPageId) {
                const pageMeasures = await imageDoc.fetchPageMeasures(currentPageId);
                references = pageMeasures.map(m => m.id);
            }
            const mdivId = references.length > 0 ? await resolveMovementId(references[0]) : null;
            await activateMeasureView({ mdivId, references, index: 0 });

        } else if (newMode === "page-view") {
            // Measure → Page: the page of the shown measure (the first voice row's, in a part-wise source).
            const currentMeasureStep = _measureSequenceData[_currentSequenceIndex];
            let targetPageId = null;
            if (_voiceMode) {
                targetPageId = measureStack.firstPageId();
            } else if (currentMeasureStep?.zoneId) {
                targetPageId = imageDoc.measurePageIdCache.get(currentMeasureStep.zoneId) ?? null;
            }
            activatePageView(targetPageId);
        }
    }

    // --- setData ---
    // Called by views.js applyViewData / applyCurrentViewFilterState with either
    // mainData or subsetData.  Tile sources, zones-data, the page numbers, and
    // measure caches are set once in update() and survive filter toggles.
    // isNavigationUpdate is true when called from a concordance connection switch
    // or any other navigation event; false (default) for filter-state toggles.
    function setData({ pages, movements, measureSubsetIds, mdivId, jumpMeasureId }, { isNavigationUpdate = false } = {}) {
        // Capture current state before rebuilding sequences
        const wasInitialized = _sequenceData.length > 0;
        const previousViewMode = _viewMode;
        const previousStep = _sequenceData[_currentSequenceIndex] || null;

        _pages = pages;
        _movements = movements || [];
        _activeMeasureSubsetIds = measureSubsetIds || null;
        _subsetMdivId = measureSubsetIds ? (mdivId ?? null) : null;

        // Clear lazily-built measure sequences (rebuilt by activateMeasureView)
        _measureSequenceData = [];
        _measureLabels = [];

        // Build page sequence from the (possibly filtered) pages
        _pageSequenceData = pages.map(page => ({ type: "page", id: page.id }));
        _pageLabels = pages.map(page => page.name);

        // Show/hide toggle based on movements availability
        viewModeButton.classList.toggle("hidden", _movements.length === 0);
        mdivSelect.setAttribute("options-data", JSON.stringify(_movements.map(m => ({ value: m.id, label: m.name || m.id }))));

        // Measure view falls back to page view where it has nothing to show.
        const openMeasureView = (options) => activateMeasureView(options).then(shown => {
            if (shown === false) activatePageView();
        });

        // A view that is brought back by "Back" returns to the page or measure it was left on, in the same mode
        // and movement (voices are remembered per document anyway, see readStoredVoices)
        const restore = _pendingRestore;
        _pendingRestore = null;

        if (restore) {
            if (restore.mode === "measure-view") {
                openMeasureView({
                    mdivId: restore.mdivId ?? mdivId,
                    references: restore.stepId ? [restore.stepId] : [],
                    index: 0
                });
            } else {
                activatePageView(restore.stepId);
            }
        } else if (!wasInitialized || isNavigationUpdate) {
            // First load or concordance connection switch: derive view mode from subset.
            // Subset present → measure view; single-ID jump → measure view on that
            // measure, unrestricted; whole-document connection → page view.
            if (_activeMeasureSubsetIds) {
                openMeasureView({ mdivId, index: 0 });
            } else if (jumpMeasureId) {
                openMeasureView({ mdivId, references: [jumpMeasureId] });
            } else {
                activatePageView();
            }
        } else {
            // Filter toggle: preserve view mode, stay on current item if still valid.
            if (previousViewMode === "measure-view") {
                const references = previousStep && previousStep.type === "zone" ? [previousStep.id] : [];
                openMeasureView({ mdivId: _activeMeasureSubsetIds ? mdivId : _currentMdivId, references });
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

            // Detect whether the document and edition are the same as the current state.
            // If so we can skip re-initialising the OSD viewer (which is expensive and
            // causes a WebGL context loss + full tile reload) and only recompute the subset.
            const edition = appState.edition.doc;
            const isSameDoc = doc === imageDoc.doc && edition === imageDoc.edition && _fullPages.length > 0;

            if (!isSameDoc) {
                // --- Full load for a new document ---

                // Reset the per-document measure and voice state
                _measuresByMdiv = new Map();
                _currentMdivId = null;
                _voiceMode = false;
                _partsPromise = null;
                _parts = [];
                _selectedVoices = null;
                _measureSequenceData = [];
                _measureLabels = [];
                measureStack.clear();

                const [pagesData, movementsData] = await Promise.all([
                    getPages(doc, edition),
                    getMovements(doc, edition)
                ]);

                if (!pagesData || pagesData.length === 0) return { mainData: null, subsetData: null };

                const movements = movementsData || [];
                _fullPages = pagesData;
                _fullMovements = movements;

                // Build tile sources from ALL pages, for the edition's image server
                const imagePrefix = getPreference("image_prefix");
                const imageSettings = {
                    imageServer: getPreference("image_server"),
                    imagePrefix: imagePrefix == null ? undefined : resolveImagePrefix(imagePrefix, getFrontendBaseUrl())
                };
                const tileSources = pagesData.map(page =>
                    buildTileSource(page.path, page.width, page.height, imageSettings));

                // Page numbers, zones and caches start anew (all viewers share them)
                imageDoc.reset(doc, edition, pagesData, tileSources);

                // Setting tilesources re-initialises the OSD viewer, so only do it when the
                // document actually changes.
                mainSession.setTileSources();
            }

            // --- Subset logic ---
            // The subset is always built for any non-empty ids, so the user can
            // manually activate filtered mode even for a single-ID target (see
            // views.js applyViewData's defaultFiltered). jumpMeasureId separately
            // carries where to land when a single-ID target starts unfiltered.
            // The target's movement is resolved from its first id (not always the first movement).
            let subsetData = null;
            let jumpMeasureId = null;
            let mdivId = null;
            if (ids.length > 0 && _fullMovements.length > 0) {
                mdivId = await resolveMovementId(ids[0]);
                const measuresData = await loadMeasures(mdivId);
                const matching = matchingGroups(measuresData, ids);
                if (matching.length > 0) {
                    const matchingGroupIds = matching.map(g => g.id);
                    if (ids.length === 1) {
                        jumpMeasureId = matchingGroupIds[0];
                    }

                    // Determine which pages contain the matching measures (the first measure of each group).
                    // For same-doc switches most entries will already be in the cache —
                    // only fetch the ones that aren't.
                    const primaryIds = matching.map(g => g.measures?.[0]?.id).filter(Boolean);
                    const uncached = primaryIds.filter(mId => !imageDoc.measurePageIdCache.has(mId));
                    if (uncached.length > 0) {
                        const pageResults = await Promise.all(
                            uncached.map(mId => getMeasurePage(doc, edition, mId))
                        );
                        for (let i = 0; i < uncached.length; i++) {
                            const data = pageResults[i];
                            if (data && data.length > 0 && data[0].pageId) {
                                imageDoc.measurePageIdCache.set(uncached[i], data[0].pageId);
                            }
                        }
                    }

                    const relevantPageIds = new Set(
                        primaryIds
                            .map(mId => imageDoc.measurePageIdCache.get(mId))
                            .filter(Boolean)
                    );

                    const filteredPages = _fullPages.filter(p => relevantPageIds.has(p.id));
                    if (filteredPages.length > 0) {
                        subsetData = { pages: filteredPages, movements: _fullMovements, measureSubsetIds: matchingGroupIds, mdivId };
                    }
                }
            }

            const mainData = { pages: _fullPages, movements: _fullMovements, jumpMeasureId, mdivId };
            return { mainData, subsetData };
        },
        setData,

        // --- "Back" navigation (see buildView in views.js) ---

        /**
         * Where the view is: the mode, the movement, and the page (page view) or measure (measure view) that is
         * shown. Null while nothing is shown yet.
         */
        captureState() {
            const step = _sequenceData[_currentSequenceIndex];
            if (!step) return null;
            return { mode: _viewMode, mdivId: _currentMdivId, stepId: step.id };
        },

        restoreState(state) {
            _pendingRestore = state && typeof state === "object" ? state : null;
        }
    };
}
