import { appConfig, appState, setAppState } from "./config.js";
import { switchPage, beginNavigation, isCurrentNavigation } from "./pages.js";
import { getLinkTarget } from "./api.js";
import { getLangString } from "./languageController.js";
import { buildAnnotationView } from "./annotationView.js";
import { buildImageView, disposeImageViewers } from "./imageView.js";
import { buildTextView } from "./textView.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { showContentLoading, hideContentLoading, resetContentLoadingState } from "./loading.js";

/** @type {function|null} Update function for the currently active view (functions are kept out of appState, which must stay plain data) */
let currentViewUpdate = null;

/** @type {function|null} Writes a data array to the currently active view component */
let currentViewSetData = null;

/** @type {Object[]|null} The full dataset from the last update of the currently active view */
let currentViewMainData = null;

/** @type {Object[]|null} The filtered subset from the last update, or null if none */
let currentViewSubsetData = null;

/** @type {string|null} The current filter state: 'filtered', 'unfiltered', or null when no subset is present */
let currentViewFilterState = null;

/** @type {HTMLElement|null} The filter button for the currently active view */
let currentViewFilterButton = null;

/** @type {HTMLElement|null} The control bar widget (edirom-control-bar) for the currently active view */
let currentViewControlBarWidget = null;

/** @type {Object[]} The available views for the currently open document (from getLinkTarget) */
let currentViewAvailableViews = [];

/** @type {string|null} The target (document URI, optional `#id` fragments) of the view window on screen, as it was opened or last updated */
let currentViewTarget = null;

/** @type {string|null} The type of the view on screen (e.g. `"sourceView"`) */
let currentViewType = null;

/** @type {function|null} Reads the state of the view on screen, see `captureViewFrame` */
let currentViewCaptureState = null;

/** @type {function|null} Asks the view on screen whether a Back has to leave it, see `viewLeavesOnBack` */
let currentViewLeaveOnBack = null;

/**
 * Resolves the view-specific URI for a given view type from the available views list.
 * Each view in getLinkTarget may carry its own `uri` (e.g. a text document URI that
 * differs from the main source document URI). If no match is found, the doc part of
 * the original target is used as a fallback. Fragment IDs from the original target
 * are always preserved.
 * @param {string} viewType - The view type (e.g. `"textView"`)
 * @param {string} target - The original target URI (with optional `#id` fragments)
 * @param {Object[]} availableViews - The available views from getLinkTarget
 * @returns {string} The view-specific target URI
 */
function resolveViewSpecificTarget(viewType, target, availableViews) {
    const { doc, ids } = splitTargetIntoDocAndIds(target);
    const viewEntry = availableViews.find(v => v.type === viewType);
    const viewUri = viewEntry?.uri ?? doc;
    return ids.length > 0 ? `${viewUri}#${ids.join('#')}` : viewUri;
}

/**
 * Fetches view metadata for the given target URI, determines the active view,
 * and switches the app to the views page. If no view is marked as default, the
 * first available view is used.
 * @param {string} target - The document URI to open (e.g. `xmldb:exist:///…#id`)
 * @param {Object} [config={}] - Additional link config (passed through to view components)
 * @param {Object} [options]
 * @param {"push"|"restore"} [options.history="push"] - `"push"`: a new page that "Back" returns from.
 *   `"restore"`: "Back" has returned to this view window (see `restoreViewFrame`).
 * @param {string|null} [options.activeView=null] - The view type to show; the default view if null or unavailable
 * @param {{viewState: *, filterState: string|null}|null} [options.restore=null] - What was captured of the view
 *   window when it was left (see `captureViewFrame`), to bring it back as it was
 * @param {number} [options.navigation] - The token of the navigation this belongs to (`beginNavigation`)
 * @returns {Promise<boolean>} `true` if the view window is shown, `false` if it could not be opened or a newer
 *   navigation took over
 */
export async function createViewWindow(target, config = {}, {
    history: historyMode = "push",
    activeView: requestedView = null,
    restore = null,
    navigation = beginNavigation()
} = {}) {
    resetContentLoadingState();
    const loadingToken = showContentLoading();
    try {
    let linkData = await getLinkTarget(target, appState.language, appState.edition.doc);

    // No data, or the user went somewhere else while it was loading (e.g. pressed Back)
    if (!linkData || !isCurrentNavigation(navigation)) return false;

    let activeView = requestedView;

    let availableViews = reduceToAvailableViews(linkData.views);
    if (availableViews.length === 0) {
        console.warn("No available views to load.");
        return false;
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
    // The view window is built once what is on screen has been captured (switchPage calls the function)
    return await switchPage("views", () => buildViewsContainer(linkData, activeView, availableViews, target, config, restore), {
        history: historyMode,
        navigation
    });
    } finally {
        hideContentLoading(loadingToken);
    }
}

/**
 * Captures the view window on screen for the navigation stack, so that "Back" can bring it back later. Called
 * when the user leaves the page (see `switchPage`), before anything of the next page is built.
 * @returns {{target: string, viewType: string, viewState: *, filterState: string|null}|null} Plain data: the
 *   window's target, the view type, what the view reports through its `captureState`, and the filter state.
 *   Null if there is no view window to capture.
 */
export function captureViewFrame() {
    if (!currentViewUpdate || !currentViewTarget) return null;

    // A view that cannot report its state must not keep the user from leaving: the window is still restored
    let viewState = null;
    try {
        viewState = currentViewCaptureState?.() ?? null;
    } catch (error) {
        console.warn("Could not capture the state of the view:", error);
    }
    return { target: currentViewTarget, viewType: currentViewType, viewState, filterState: currentViewFilterState };
}

/**
 * Brings back a view window that was captured with `captureViewFrame`: the same target and view type, with the
 * view state as it was. Used when "Back" returns to a view window.
 * @param {{target: string, viewType: string, viewState: *, filterState: string|null}} frame
 * @param {Object} [options]
 * @param {number} [options.navigation] - The token of the navigation this belongs to (`beginNavigation`)
 * @returns {Promise<boolean>} `false` if the window could not be brought back
 */
export function restoreViewFrame(frame, { navigation } = {}) {
    if (!frame?.target) return Promise.resolve(false);
    return createViewWindow(frame.target, {}, {
        history: "restore",
        activeView: frame.viewType,
        restore: { viewState: frame.viewState, filterState: frame.filterState },
        navigation
    });
}

/**
 * Asks the view on screen whether a Back has to leave it right now, without the view's web components getting a
 * `back-request` first. A view says so through its `leaveOnBack` function (see `buildAnnotationView`); most
 * views have none, so their components handle the Back as before.
 * @param {{returnsToView: boolean}} context - `returnsToView`: "Back" leaves this view for another view
 *   window (it was opened from there), not for the navigator
 * @returns {boolean}
 */
export function viewLeavesOnBack(context) {
    if (!currentViewLeaveOnBack) return false;
    try {
        return currentViewLeaveOnBack(context) === true;
    } catch (error) {
        console.warn("The view could not tell whether Back leaves it:", error);
        return false;
    }
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
 * @param {{viewState: *, filterState: string|null}|null} [restore=null] - What was captured of this window when it
 *   was left, to bring the initial view back as it was (see `captureViewFrame`)
 * @returns {HTMLElement} The views container element
 */
function buildViewsContainer(linkData, activeView, availableViews, target, config = {}, restore = null) {
    let viewsContainer = document.createElement("div");
    viewsContainer.id = "views-container";

    viewsContainer.appendChild(buildViewHeader(linkData, availableViews, activeView));

    viewsContainer.addEventListener("switch-view-request", (event) => {
        switchView(viewsContainer, event.detail.newView, target, config, availableViews);
    });

    const viewContent = document.createElement("div");
    viewContent.id = "view-content";
    viewsContainer.appendChild(viewContent);

    const controlBarWrapper = document.createElement("div");
    controlBarWrapper.id = "view-control-bar-wrapper";
    viewsContainer.appendChild(controlBarWrapper);

    switchView(viewsContainer, activeView, target, config, availableViews, restore);

    return viewsContainer;
}

/**
 * Dispatches to the appropriate view-type-specific builder. Each builder
 * constructs the view web component, its control bar, wires up their
 * bidirectional event listeners, and returns an update function for fetching
 * new data and a setData function for writing data to the component.
 *
 * A view can also take part in "Back" navigation (all three are optional; a view without them is brought
 * back by its target alone):
 * - `captureState()` returns the state of the view as plain, structured-cloneable data (or null), read when
 *   the user leaves the page.
 * - `restoreState(state)` is called once, right after the view is built and before its data is fetched, with
 *   what `captureState` returned. The view applies it together with its first `setData`.
 * - `leaveOnBack({ returnsToView })` returns true if a Back has to leave the view straight away, so that the
 *   web components of the view are not sent the `back-request` first. Most views leave this to their components.
 * @param {string} viewType - The view type to build (e.g. `"annotationView"`)
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config passed to the view component
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, controlBarWidget: HTMLElement, update: function, setData: function, captureState?: function, restoreState?: function, leaveOnBack?: function }} The view content, control bar wrapper, control bar widget, data-fetch function, data-write function and the optional "Back" hooks
 */
function buildView(viewType, target, config = {}) {
    switch (viewType) {
        case "annotationView":
            return buildAnnotationView(target, config);
        case "sourceView":
            return buildImageView(target, config);
        case "textView":
            return buildTextView(target, config);
        default:
            console.warn(`Unknown view type: ${viewType}`);
            return {
                content: Object.assign(document.createElement("div"), { id: "view-content" }),
                controlBar: Object.assign(document.createElement("div"), { id: "view-control-bar-container" }),
                controlBarWidget: document.createElement("edirom-control-bar"),
                update: async () => ({ mainData: null, subsetData: null }),
                setData: () => { }
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

    const viewIcon = document.createElement("edirom-icon");
    const activeViewConfig = availableViews.find(v => v.type === activeView);
    viewIcon.setAttribute("name", activeViewConfig?.icon || "visibility");
    viewIcon.setAttribute("size", "1.3em");
    selectContainer.appendChild(viewIcon);

    const viewSelect = document.createElement("select");
    viewSelect.setAttribute("aria-label", getLangString("view.window.TopBar_View", "View"));

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
            activeView = selectedView;
            const selectedViewConfig = availableViews.find(v => v.type === selectedView);
            viewIcon.setAttribute("name", selectedViewConfig?.icon || "visibility");
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
 * Applies main and subset data to the currently active view, updating filter
 * button visibility and pushing the effective dataset to the view component.
 * Called after both initial data loads and subsequent updates.
 * @param {Object[]|null} mainData - The full dataset fetched for the active target
 * @param {Object[]|null} subsetData - The filtered subset, or null if none
 * @param {boolean} [isNavigationUpdate=false] - True when called from a view update
 *   triggered by navigation (e.g. concordance connection switch), as opposed to a
 *   filter-state toggle. Views may use this to decide whether to derive their internal
 *   display mode from the new data rather than preserving the current mode.
 * @param {boolean} [defaultFiltered=true] - Whether filtered mode should be active
 *   by default when a subset exists. Targets with a single ID still expose the
 *   subset/filter button for the user to activate manually, but start unfiltered.
 */
function applyViewData(mainData, subsetData, isNavigationUpdate = false, defaultFiltered = true) {
    if (mainData === null) return;
    currentViewMainData = mainData;
    currentViewSubsetData = subsetData;
    if (subsetData !== null) {
        currentViewFilterState = defaultFiltered ? 'filtered' : 'unfiltered';
        currentViewFilterButton.setAttribute("current-state", currentViewFilterState);
        currentViewFilterButton.classList.remove("hidden");
        currentViewControlBarWidget?.classList.toggle("filtered-state", defaultFiltered);
        currentViewSetData(defaultFiltered ? subsetData : mainData, { isNavigationUpdate });
    } else {
        currentViewFilterState = null;
        currentViewFilterButton.classList.add("hidden");
        currentViewControlBarWidget?.classList.remove("filtered-state");
        currentViewSetData(mainData, { isNavigationUpdate });
    }
}

/**
 * Applies a new filter state to the currently active view: switches between
 * main data and subset data and updates the filter button accordingly.
 * @param {string} newFilterState - Either `'filtered'` or `'unfiltered'`
 */
function applyCurrentViewFilterState(newFilterState) {
    currentViewFilterState = newFilterState;
    const effectiveData = newFilterState === 'filtered' ? currentViewSubsetData : currentViewMainData;
    currentViewSetData(effectiveData);
    currentViewFilterButton.setAttribute("current-state", newFilterState);
    currentViewControlBarWidget?.classList.toggle("filtered-state", newFilterState === 'filtered');
}

/**
 * Replaces the view content and control bar inside `viewsContainer` with
 * newly built elements for `newView`, stores the update function, and
 * triggers an initial data load.
 * @param {HTMLElement} viewsContainer - The views page container element
 * @param {string} newView - The view type to switch to (e.g. `"annotationView"`)
 * @param {string} target - The document URI for the new view
 * @param {Object} [config={}] - Additional link config passed to view components
 * @param {Object[]} [availableViews=[]] - The available views from getLinkTarget, used to resolve view-specific URIs
 * @param {{viewState: *, filterState: string|null}|null} [restore=null] - What was captured when the window was
 *   left: the view gets its `viewState` (see `restoreState` of the view builders) and the filter state is
 *   applied with the first data
 */
async function switchView(viewsContainer, newView, target, config = {}, availableViews = [], restore = null) {
    currentViewAvailableViews = availableViews;
    const viewSpecificTarget = resolveViewSpecificTarget(newView, target, availableViews);
    const view = buildView(newView, viewSpecificTarget, config);

    const filterButton = document.createElement("edirom-button-widget");
    filterButton.id = "view-filter-button";
    filterButton.setAttribute("states-data", JSON.stringify([
        { name: "filtered", iconName: "filter_alt" },
        { name: "unfiltered", iconName: "filter_alt_off" },
    ]));
    filterButton.classList.add("hidden");
    filterButton.addEventListener("button-state-requested", (event) => {
        applyCurrentViewFilterState(event.detail.requestedState);
    });
    view.controlBarWidget.appendChild(filterButton);
    currentViewControlBarWidget = view.controlBarWidget;
    currentViewControlBarWidget.classList.remove("filtered-state");

    const previousContent = viewsContainer.querySelector("#view-content");
    disposeImageViewers(previousContent);
    previousContent.replaceWith(view.content);

    const controlBarSlot = viewsContainer.querySelector("#view-control-bar-wrapper");
    controlBarSlot.innerHTML = "";
    controlBarSlot.appendChild(view.controlBar);

    setAppState({ viewWindow: { ...appState.viewWindow, view: newView } });
    currentViewUpdate = view.update;
    currentViewSetData = view.setData;
    currentViewFilterButton = filterButton;
    currentViewMainData = null;
    currentViewSubsetData = null;
    currentViewFilterState = null;
    currentViewTarget = target;
    currentViewType = newView;
    currentViewCaptureState = view.captureState ?? null;
    currentViewLeaveOnBack = view.leaveOnBack ?? null;

    // The view applies this together with its first data (it may not have any yet)
    if (restore?.viewState != null && view.restoreState) {
        try {
            view.restoreState(restore.viewState);
        } catch (error) {
            console.warn("Could not restore the state of the view:", error);
        }
    }

    const loadingToken = showContentLoading();
    let mainData, subsetData;
    try {
        ({ mainData, subsetData } = await view.update(viewSpecificTarget, viewsContainer));
    } finally {
        hideContentLoading(loadingToken);
    }
    // Another view took over while this one was loading (the user went Back, or chose another view type):
    // its data must not be written into the view that is current now.
    if (currentViewSetData !== view.setData) return;

    const { ids } = splitTargetIntoDocAndIds(viewSpecificTarget);
    // A window that comes back from "Back" keeps the filter state it was left in
    const restoredFilter = restore?.filterState === "filtered" ? true : restore?.filterState === "unfiltered" ? false : null;
    applyViewData(mainData, subsetData, true, restoredFilter ?? ids.length > 1);
    setAppState({ viewWindow: { ...appState.viewWindow, target, viewSpecificTarget } });
}

/**
 * Updates the currently displayed view with new target data using the stored
 * update function. Also writes the new target to `appState.viewWindow.target`.
 * @param {string} target - The document URI (with optional `#id` fragment) to load
 * @param {HTMLElement} viewContentDiv - The container element holding the active view component
 * @param {Object} [config={}] - Additional link config (currently unused)
 */
export async function updateCurrentView(target, viewContentDiv, config = {}) {
    if (currentViewUpdate) {
        const viewSpecificTarget = resolveViewSpecificTarget(appState.viewWindow.view, target, currentViewAvailableViews);
        resetContentLoadingState();
        const loadingToken = showContentLoading();
        let mainData, subsetData;
        try {
            ({ mainData, subsetData } = await currentViewUpdate(viewSpecificTarget, viewContentDiv));
        } finally {
            hideContentLoading(loadingToken);
        }
        const { ids } = splitTargetIntoDocAndIds(viewSpecificTarget);
        applyViewData(mainData, subsetData, true, ids.length > 1);
        setAppState({ viewWindow: { ...appState.viewWindow, target, viewSpecificTarget } });
        currentViewTarget = target;
    } else {
        console.warn(`No update function defined for view type: ${appState.viewWindow.view}`);
    }
}

/**
 * Clears the subset from the currently active view, falling back to main data.
 * Hides the filter button. Only acts when a view is currently displayed.
 */
export function removeCurrentViewSubset() {
    if (appState.page !== "views" || !currentViewSetData) return;
    currentViewSubsetData = null;
    currentViewFilterState = null;
    currentViewFilterButton?.classList.add("hidden");
    currentViewControlBarWidget?.classList.remove("filtered-state");
    currentViewSetData(currentViewMainData);
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
        const configView = appConfig.availableViews.find(av => av.view === view.type);
        if (configView) {
            availableViews.push({
                ...view,
                label: view.label || getLangString(configView.labelKey, configView.label),
                icon: configView.icon
            });
        }
    });
    return availableViews;
}