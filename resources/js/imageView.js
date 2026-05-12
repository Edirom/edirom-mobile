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
    function setData({ pages, movements, measureSubsetIds }, { isNavigationUpdate = false } = {}) {
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
            // Subset present → measure view; whole-document connection → page view.
            if (_activeMeasureSubsetIds) {
                activateMeasureView(0);
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

                // Build tile sources from ALL pages
                let tileSources = pagesData.map(page => {
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
                // Setting tilesources re-initialises the OSD viewer, so only do it when the
                // document actually changes.
                imageViewComponent.setAttribute("tilesources", JSON.stringify(tileSources));
                imageViewComponent.setAttribute("zones-data", "{}");
            }

            const mainData = { pages: _fullPages, movements: _fullMovements };

            // --- Subset logic ---
            let subsetData = null;
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

            return { mainData, subsetData };
        },
        setData
    };
}
