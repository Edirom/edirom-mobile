import { appState } from "./config.js";
import { getText } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

/**
 * Builds the text viewer web component and its control bar together,
 * wiring up data management via direct variable references.
 * Returns the content container, control bar container, the control bar widget
 * element, an update function for fetching HTML text data, and a setData
 * function for pushing data to the component.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config (currently unused)
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, controlBarWidget: HTMLElement, update: function, setData: function }}
 */
export function buildTextView(target, config = {}) {
    const textViewComponent = document.createElement("edirom-text-viewer");
    textViewComponent.classList.add("web-component");
    textViewComponent.setAttribute("layout-mode", "mobile");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(textViewComponent);

    // Stores the fragment ID to scroll to after the next setData call
    let _scrollToId = null;

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");
    controlBar.appendChild(spacer);

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    function setData(htmlString) {
        if (htmlString === null) return;
        // Set scroll-to-id before html-data so renderText() picks up the target element
        if (_scrollToId) {
            textViewComponent.setAttribute("scroll-to-id", _scrollToId);
        } else {
            textViewComponent.removeAttribute("scroll-to-id");
        }
        textViewComponent.setAttribute("html-data", htmlString);
    }

    async function update(target) {
        const { doc, ids } = splitTargetIntoDocAndIds(target);
        _scrollToId = ids.length > 0 ? ids[0] : null;

        const htmlData = await getText(doc, appState.edition.doc);
        if (!htmlData) return { mainData: null, subsetData: null };

        return { mainData: htmlData, subsetData: null };
    }

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update,
        setData
    };
}
