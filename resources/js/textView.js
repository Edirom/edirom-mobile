import { appState } from "./config.js";
import { getText } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { loadLinks, parseTargets } from "./linkController.js";

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

    // Intercept loadLink calls embedded as onclick attributes in the rendered HTML.
    // The web component dispatches a 'load-link' event with a plist string that
    // already encodes the URI and any config block in parseTargets-compatible format.
    textViewComponent.addEventListener('load-link', (e) => {
        const parsed = parseTargets(e.detail.plist);
        console.log("Parsed load-link targets:", parsed);
        const config = parsed[0]?.config ?? {};

        // Map Edirom Online config keys to a Mobile behaviour.
        // config.behaviour takes precedence if present (forwarded as-is via additionalConfig).
        // useExisting:false means the caller explicitly wants a new view window.
        // All other cases default to updating in-place or opening a new window.
        let defaultBehaviour;
        if (config.behaviour) {
            defaultBehaviour = config.behaviour;
        } else if (config.useExisting === false) {
            defaultBehaviour = 'createViewWindow';
        } else {
            defaultBehaviour = 'updateViewOrCreateViewWindow';
        }
        console.log("Derived load-link behaviour:", defaultBehaviour);
        loadLinks(e.detail.plist, { behaviour: defaultBehaviour });
    });

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(textViewComponent);

    // Stores the fragment ID to scroll to after the next setData call
    let _scrollToId = null;
    // Scroll position to bring back with the next setData call (see restoreState), or null
    let _pendingScrollTop = null;
    // Caches the last fetched HTML to avoid re-fetching when only the fragment changes
    let _currentDocUrl = null;
    let _cachedHtml = null;

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
        // A text that is brought back by "Back" returns to where it was left, not to the anchor it was opened at
        const scrollTop = _pendingScrollTop;
        _pendingScrollTop = null;
        // Set scroll-to-id before html-data so renderText() picks up the target element
        if (_scrollToId && scrollTop === null) {
            textViewComponent.setAttribute("scroll-to-id", "textView_" + _scrollToId);
        } else {
            textViewComponent.removeAttribute("scroll-to-id");
        }
        textViewComponent.setAttribute("html-data", htmlString);
        if (scrollTop !== null) {
            // The component itself is the scroller. Set again after layout, in case the text was still growing.
            textViewComponent.scrollTop = scrollTop;
            requestAnimationFrame(() => { textViewComponent.scrollTop = scrollTop; });
        }
    }

    async function update(target) {
        const { doc, ids } = splitTargetIntoDocAndIds(target);
        console.log(`Updating text view for doc "${doc}" and ids:`, ids);
        _scrollToId = ids.length > 0 ? ids[0] : null;

        if (doc === _currentDocUrl && _cachedHtml !== null) {
            return { mainData: _cachedHtml, subsetData: null };
        }

        const htmlData = await getText(doc, appState.edition.doc);
        if (!htmlData) return { mainData: null, subsetData: null };

        _currentDocUrl = doc;
        _cachedHtml = htmlData;
        return { mainData: htmlData, subsetData: null };
    }

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update,
        setData,

        // --- "Back" navigation (see buildView in views.js) ---

        /** How far the text is scrolled. */
        captureState() {
            return { scrollTop: textViewComponent.scrollTop };
        },

        restoreState(state) {
            const scrollTop = Number(state?.scrollTop);
            _pendingScrollTop = Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : null;
        }
    };
}
