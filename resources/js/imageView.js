import { appState } from "./config.js";
import { getPages } from "./api.js";
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

    // Internal sequence state (page-only for now; zones can be added later)
    let _sequenceData = [];      // [{ type: "page"|"zone", id: string }]
    let _pageIdToIndex = new Map(); // pageId → 1-based pageNumber
    let _labels = [];            // display name per sequence entry
    let _currentSequenceIndex = 0;

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");
    controlBar.appendChild(spacer);

    // PAGE STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "image-step-spin-box";
    spinBox.setAttribute("label", "Seite");

    // Spin box → viewer: only set attribute on component, never update spin box directly.
    spinBox.addEventListener("spin-box-step-requested", (event) => {
        const label = event.detail.requestedStep;
        const idx = findNearestIndex(_labels, label, _currentSequenceIndex);
        if (idx === -1) return;
        _currentSequenceIndex = idx;
        const step = _sequenceData[idx];
        if (step.type === "page") {
            imageViewComponent.setAttribute("pagenumber", String(_pageIdToIndex.get(step.id)));
        } else if (step.type === "zone") {
            imageViewComponent.setAttribute("zone", step.id);
        }
    });

    // Viewer → spin box: update spin box only via viewer feedback events.
    imageViewComponent.addEventListener("page-changed", (event) => {
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
        const { zoneKey } = event.detail;
        const idx = _sequenceData.findIndex(s => s.type === "zone" && s.id === zoneKey);
        if (idx !== -1) {
            _currentSequenceIndex = idx;
            spinBox.setAttribute("current-step", _labels[idx]);
        }
    });

    controlBar.appendChild(spinBox);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    function setData(pages) {
        // Build tile sources for OSD
        let tileSources = pages.map(page => {
            // For absolute IIIF Image API base URLs: build an inline info object so
            // OSD never fetches info.json cross-origin (the same approach as the
            // desktop OpenSeaDragonViewer.showImage). OSD then requests
            // full/{containerWidth},/0/default.jpg for the initial view and
            // {x},{y},{w},{h}/{size},/0/default.jpg tiles as the user zooms.
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

        // Build internal sequence from pages
        _pageIdToIndex = new Map(pages.map((page, index) => [page.id, index + 1]));
        _sequenceData = pages.map(page => ({ type: "page", id: page.id }));
        _labels = pages.map(page => page.name);
        _currentSequenceIndex = 0;

        spinBox.setAttribute("steps-data", JSON.stringify(_labels));
        spinBox.setAttribute("current-step", _labels[0]);
        imageViewComponent.setAttribute("pagenumber", "1");
    }

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update: (target) => updateImageViewWebComponent(target, imageViewComponent),
        setData
    };
}

/**
 * Fetches the pages list for the given target URI and returns main and subset data.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {HTMLElement} imageViewComponent - The image viewer web component
 * @returns {Promise<{ mainData: Object[]|null, subsetData: Object[]|null }>}
 */
async function updateImageViewWebComponent(target, imageViewComponent) {
    const { doc } = splitTargetIntoDocAndIds(target);

    const pagesData = await getPages(doc, appState.edition.doc);

    if (!pagesData || pagesData.length === 0) return { mainData: null, subsetData: null };

    return { mainData: pagesData, subsetData: null };
}
