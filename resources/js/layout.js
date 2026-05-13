import { appConfig } from "./config.js";

let viewHeaderResizeObserver;
let viewHeaderAttributeObserver;
let viewHeaderPresenceObserver;

/**
 * Measures the heights of the header and view header and writes them
 * to CSS custom properties (`--header-height`, `--view-header-height`,
 * `--viewport-height`) on `:root`. Called on resize and
 * whenever the view header changes.
 */
export function updateLayoutMetrics() {
    const root = document.documentElement;
    const header = document.querySelector("header");
    const viewHeader = document.getElementById(appConfig.viewHeaderId);
    const viewportHeight = window.innerHeight;

    if (viewportHeight) {
        root.style.setProperty("--viewport-height", `${viewportHeight}px`);
    }

    if (header) {
        root.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
    }

    if (viewHeader) {
        root.style.setProperty("--view-header-height", `${viewHeader.getBoundingClientRect().height}px`);
    } else {
        root.style.setProperty("--view-header-height", "0px");
    }

    const controlBar = document.getElementById("view-control-bar-container");
    root.style.setProperty("--active-control-bar-height", controlBar ? "var(--control-bar-height)" : "0px");
}

/**
 * Attaches a ResizeObserver and a MutationObserver to the view header element so
 * that `updateLayoutMetrics` is called whenever its size or relevant attributes
 * change. Disconnects any previously attached observers first.
 */
function connectViewHeaderObservers() {
    if (viewHeaderResizeObserver) {
        viewHeaderResizeObserver.disconnect();
        viewHeaderResizeObserver = null;
    }

    if (viewHeaderAttributeObserver) {
        viewHeaderAttributeObserver.disconnect();
        viewHeaderAttributeObserver = null;
    }

    const viewHeader = document.getElementById(appConfig.viewHeaderId);

    if (!viewHeader) {
        return;
    }

    if (typeof ResizeObserver !== "undefined") {
        viewHeaderResizeObserver = new ResizeObserver(updateLayoutMetrics);
        viewHeaderResizeObserver.observe(viewHeader);
    }

    viewHeaderAttributeObserver = new MutationObserver(updateLayoutMetrics);
    viewHeaderAttributeObserver.observe(viewHeader, { attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
}

/**
 * Sets up a MutationObserver on `document.body` that detects when the view
 * header element is added to or removed from the DOM. Re-connects the view
 * header observers and recalculates layout metrics whenever it changes.
 */
function watchViewHeaderPresence() {
    if (viewHeaderPresenceObserver) {
        viewHeaderPresenceObserver.disconnect();
    }

    viewHeaderPresenceObserver = new MutationObserver((mutations) => {
        const viewHeaderMutated = mutations.some((mutation) => {
            const added = Array.from(mutation.addedNodes).some((node) => node.id === appConfig.viewHeaderId || (node instanceof Element && node.querySelector && node.querySelector(`#${appConfig.viewHeaderId}`)));
            const removed = Array.from(mutation.removedNodes).some((node) => node.id === appConfig.viewHeaderId || (node instanceof Element && node.querySelector && node.querySelector(`#${appConfig.viewHeaderId}`)));
            const controlBarAdded = Array.from(mutation.addedNodes).some((node) => node.id === "view-control-bar-container" || (node instanceof Element && node.querySelector && node.querySelector("#view-control-bar-container")));
            const controlBarRemoved = Array.from(mutation.removedNodes).some((node) => node.id === "view-control-bar-container" || (node instanceof Element && node.querySelector && node.querySelector("#view-control-bar-container")));
            return added || removed || controlBarAdded || controlBarRemoved;
        });

        if (viewHeaderMutated) {
            connectViewHeaderObservers();
            updateLayoutMetrics();
        }
    });

    viewHeaderPresenceObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Registers all layout-related event listeners and observers. Performs an initial
 * metrics calculation and attaches listeners for window resize, orientation change,
 * page load, and — if available — the Visual Viewport API.
 */
export function registerLayoutListeners() {
    updateLayoutMetrics();
    window.addEventListener("resize", updateLayoutMetrics);
    window.addEventListener("orientationchange", updateLayoutMetrics);
    window.addEventListener("load", updateLayoutMetrics);
    connectViewHeaderObservers();
    watchViewHeaderPresence();

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateLayoutMetrics);
    }
}