import { appState } from "./config.js";
import { getPages } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

/**
 * Builds the image viewer web component and its control bar together.
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
    imageViewComponent.setAttribute("showsequencecontrol", "true");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(imageViewComponent);

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");
    controlBar.appendChild(spacer);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    function setData(pages) {
        let tileSources = pages.map(page => {
            // For absolute IIIF Image API base URLs: build an inline info object so
            // OSD never fetches info.json cross-origin (the same approach as the
            // desktop OpenSeaDragonViewer.showImage).  OSD then requests
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
