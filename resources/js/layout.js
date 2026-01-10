import { VIEW_HEADER_ID } from "./constants.js";

let viewHeaderResizeObserver;
let viewHeaderAttributeObserver;
let viewHeaderPresenceObserver;

function updateLayoutMetrics() {
    const root = document.documentElement;
    const header = document.querySelector("header");
    const viewHeader = document.getElementById(VIEW_HEADER_ID);
    const footer = document.querySelector("footer");
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

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

    if (footer) {
        root.style.setProperty("--footer-height", `${footer.getBoundingClientRect().height}px`);
    }
}

function connectViewHeaderObservers() {
    if (viewHeaderResizeObserver) {
        viewHeaderResizeObserver.disconnect();
        viewHeaderResizeObserver = null;
    }

    if (viewHeaderAttributeObserver) {
        viewHeaderAttributeObserver.disconnect();
        viewHeaderAttributeObserver = null;
    }

    const viewHeader = document.getElementById(VIEW_HEADER_ID);

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

function watchViewHeaderPresence() {
    if (viewHeaderPresenceObserver) {
        viewHeaderPresenceObserver.disconnect();
    }

    viewHeaderPresenceObserver = new MutationObserver((mutations) => {
        const viewHeaderMutated = mutations.some((mutation) => {
            const added = Array.from(mutation.addedNodes).some((node) => node.id === VIEW_HEADER_ID || (node instanceof Element && node.querySelector && node.querySelector(`#${VIEW_HEADER_ID}`)));
            const removed = Array.from(mutation.removedNodes).some((node) => node.id === VIEW_HEADER_ID || (node instanceof Element && node.querySelector && node.querySelector(`#${VIEW_HEADER_ID}`)));
            return added || removed;
        });

        if (viewHeaderMutated) {
            connectViewHeaderObservers();
            updateLayoutMetrics();
        }
    });

    viewHeaderPresenceObserver.observe(document.body, { childList: true, subtree: true });
}

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