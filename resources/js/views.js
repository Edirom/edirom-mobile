import { appConfig, appState } from "./config.js";
import { switchPage } from "./pages.js";
import { getLinkTarget } from "./api.js";
import { buildAnnotationView } from "./annotationView.js";

/** @type {function|null} Update function for the currently active view (not stored on appState to avoid history.pushState serialization issues) */
let currentViewUpdate = null;

/** @type {function|null} Removes subset data from the currently active view, causing it to fall back to its main data */
let currentViewRemoveSubset = null;

/**
 * Fetches view metadata for the given target URI, determines the active view,
 * and switches the app to the views page. If no view is marked as default, the
 * first available view is used.
 * @param {string} target - The document URI to open (e.g. `xmldb:exist:///…#id`)
 * @param {Object} [config={}] - Additional link config (passed through to view components)
 * @returns {Promise<void>}
 */
export async function createViewWindow(target, config = {}) {

    let linkData = await getLinkTarget(target, appState.language, appState.edition.doc);

    let activeView = null;

    let availableViews = reduceToAvailableViews(linkData.views);
    if (availableViews.length === 0) {
        console.warn("No available views to load.");
        return;
    }
    // If no active view is specified or the specified one is not available, pick the first available or the default one
    if (activeView === null || !availableViews.some(view => view.type === activeView)) {
        activeView = availableViews[0].type;
        linkData.views.forEach(view => {
            if (view.defaultView === true) {
                activeView = view.type;
            }
        });
    }
    switchPage("views", buildViewsContainer(linkData, activeView, availableViews, target, config));
}

/**
 * Assembles the views page container with a view header (tab bar + title),
 * an empty view content slot, and an empty control bar slot. Immediately calls
 * `switchView` to populate both slots with the initial active view.
 * @param {Object} linkData - Link target data (used for title and view list)
 * @param {string} activeView - The type of the view to display initially
 * @param {Object[]} availableViews - The filtered list of views to show as tabs
 * @param {string} target - The document URI for the displayed content
 * @param {Object} [config={}] - Additional link config passed to view components
 * @returns {HTMLElement} The views container element
 */
function buildViewsContainer(linkData, activeView, availableViews, target, config = {}) {
    let viewsContainer = document.createElement("div");
    viewsContainer.id = "views-container";

    viewsContainer.appendChild(buildViewHeader(linkData, availableViews, activeView));

    viewsContainer.addEventListener("switch-view-request", (event) => {
        switchView(viewsContainer, event.detail.newView, target, config);
    });

    const viewContent = document.createElement("div");
    viewContent.id = "view-content";
    viewsContainer.appendChild(viewContent);

    const viewControlBar = document.createElement("div");
    viewControlBar.id = "view-control-bar-container";
    viewsContainer.appendChild(viewControlBar);

    switchView(viewsContainer, activeView, target, config);

    return viewsContainer;
}

/**
 * Dispatches to the appropriate view-type-specific builder. Each builder
 * constructs the view web component, its control bar, wires up their
 * bidirectional event listeners, and returns an update function for loading
 * new data without rebuilding the DOM.
 * @param {string} viewType - The view type to build (e.g. `"annotationView"`)
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config passed to the view component
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, update: function, removeSubset: function }} The view content, control bar, data-update function, and subset-removal function
 */
function buildView(viewType, target, config = {}) {
    switch (viewType) {
        case "annotationView":
            return buildAnnotationView(target, config);
        default:
            console.warn(`Unknown view type: ${viewType}`);
            return {
                content: Object.assign(document.createElement("div"), { id: "view-content" }),
                controlBar: Object.assign(document.createElement("div"), { id: "view-control-bar-container" }),
                update: () => { },
                removeSubset: () => { }
            };
    }
}

/**
 * Builds the view header element containing a view-type selector dropdown and a title.
 * @param {Object} linkData - Link target data, used for the title
 * @param {Object[]} availableViews - The views to show as options in the selector
 * @param {string} activeView - The currently active view type
 * @returns {HTMLElement} The view header container element
 */
function buildViewHeader(linkData, availableViews, activeView) {
    const viewHeaderContainer = document.createElement("div");
    viewHeaderContainer.id = "view-header-container";

    const viewHeader = document.createElement("div");
    viewHeader.id = appConfig.viewHeaderId;

    const selectContainer = document.createElement("div");
    selectContainer.classList.add("view-select-container");

    const viewSelect = document.createElement("select");
    viewSelect.setAttribute("aria-label", "Select view");

    availableViews.forEach(view => {
        const option = document.createElement("option");
        option.value = view.type;
        option.textContent = view.label || view.type;
        option.selected = (view.type === activeView);
        viewSelect.appendChild(option);
    });

    viewSelect.addEventListener("change", (event) => {
        const selectedView = event.target.value;
        if (selectedView !== activeView) {
            viewHeaderContainer.dispatchEvent(new CustomEvent("switch-view-request", {
                detail: { newView: selectedView },
                bubbles: true
            }));
        }
    });

    selectContainer.appendChild(viewSelect);
    viewHeader.appendChild(selectContainer);

    const titleEl = document.createElement("div");
    titleEl.classList.add("view-title");
    titleEl.textContent = linkData.title || "";
    viewHeader.appendChild(titleEl);
    viewHeaderContainer.appendChild(viewHeader);
    return viewHeaderContainer;
}

/**
 * Replaces the view content and control bar inside `viewsContainer` with
 * newly built elements for `newView`, stores the update function, and
 * triggers an initial data load.
 * @param {HTMLElement} viewsContainer - The views page container element
 * @param {string} newView - The view type to switch to (e.g. `"annotationView"`)
 * @param {string} target - The document URI for the new view
 * @param {Object} [config={}] - Additional link config passed to view components
 */
function switchView(viewsContainer, newView, target, config = {}) {
    const view = buildView(newView, target, config);

    viewsContainer.querySelector("#view-content").replaceWith(view.content);
    viewsContainer.querySelector("#view-control-bar-container").replaceWith(view.controlBar);

    appState.viewWindow.view = newView;
    currentViewUpdate = view.update;
    currentViewRemoveSubset = view.removeSubset;

    view.update(target, viewsContainer);
    appState.viewWindow.target = target;
}

/**
 * Updates the currently displayed view with new target data using the stored
 * update function. Also writes the new target to `appState.viewWindow.target`.
 * @param {string} target - The document URI (with optional `#id` fragment) to load
 * @param {HTMLElement} viewContentDiv - The container element holding the active view component
 * @param {Object} [config={}] - Additional link config (currently unused)
 */
export function updateCurrentView(target, viewContentDiv, config = {}) {
    if (currentViewUpdate) {
        currentViewUpdate(target, viewContentDiv);
        appState.viewWindow.target = target;
    } else {
        console.warn(`No update function defined for view type: ${appState.viewWindow.view}`);
    }
}

/**
 * Removes subset data from the currently active view, causing it to fall back
 * to its main data. Only acts when a view is currently displayed.
 */
export function removeCurrentViewSubset() {
    if (appState.page === "views" && currentViewRemoveSubset) {
        currentViewRemoveSubset();
    }
}


/**
 * Filters a list of view objects to only those whose type is listed in
 * `appConfig.availableViews`.
 * @param {Object[]} views - All view objects from the link target data
 * @returns {Object[]} The subset of views that are available in this app
 */
function reduceToAvailableViews(views) {
    var availableViews = [];
    views.forEach(view => {
        if (appConfig.availableViews.includes(view.type)) {
            availableViews.push(view);
        }
    });
    return availableViews;
}