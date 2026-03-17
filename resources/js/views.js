import { appConfig, appState } from "./config.js";
import { switchPage } from "./pages.js";
import { getAnnotations, getAnnotationText, getAnnotationPreviews, getLinkTarget } from "./api.js";

/**
 * Filters the available views from `linkData`, determines the active view, and
 * switches the page to the views container. If `activeView` is not given or not
 * available, the first available view (or the one marked as default) is used.
 * @param {Object} linkData - Link target data including a `views` array
 * @param {string|null} [activeView] - The view type to activate initially
 */
export async function loadViews(target, config = {}) {

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
 * Assembles the views page container with a view header (tab bar + title)
 * and the current view content area.
 * @param {Object} linkData - Link target data
 * @param {string} activeView - The type of the view to display
 * @param {Object[]} availableViews - The filtered list of views to show as tabs
 * @returns {HTMLElement} The views container element
 */
function buildViewsContainer(linkData, activeView, availableViews, target, config = {}) {
    let viewsContainer = document.createElement("div");
    viewsContainer.id = "views-container";

    viewsContainer.appendChild(buildViewHeader(linkData, availableViews, activeView));

    viewsContainer.addEventListener("switch-view-request", (event) => {
        let newViewContent = buildViewContent(event.detail.newView, target, config);
        viewContent.replaceWith(newViewContent);
        viewContent = newViewContent;

        let newViewControlBar = buildViewControlBar(event.detail.newView);
        viewControlBar.replaceWith(newViewControlBar);
        viewControlBar = newViewControlBar;
    });

    let viewContent = buildViewContent(activeView, target, config);
    viewsContainer.appendChild(viewContent);

    let viewControlBar = buildViewControlBar(activeView);
    viewsContainer.appendChild(viewControlBar);

    return viewsContainer;
}

function splitTargetIntoDocAndIds(target) {
    let [doc, ...ids] = target.split("#");
    return { doc, ids };
}

/**
 * Creates and returns an `<edirom-annotation-view>` web component for the given
 * document URI. Fetches the annotations list immediately and registers a listener
 * to load full annotation data when an annotation is selected.
 * @param {string} docUri - The document URI to load annotations for
 * @returns {Promise<HTMLElement>} The configured annotation view element
 */
async function buildAnnotationViewWebComponent(target, config = {}) {
    console.log("Building annotation view for target:", target, config);
    const annotationViewComponent = document.createElement("edirom-annotation-view");
    annotationViewComponent.classList.add("web-component");
    annotationViewComponent.setAttribute("layout-mode", "mobile");

    let { doc, ids } = splitTargetIntoDocAndIds(target);

    let annotationsData = (await getAnnotations(appState.edition.doc, doc)).annotations;
    console.log("Fetched annotations data:", annotationsData);

    if (annotationsData) {
        annotationViewComponent.setAttribute("annotations-data", JSON.stringify(annotationsData));
        annotationViewComponent.setAttribute("current-page", "annotations");

        if (ids.length > 0) {
            let annotationsDataSubset = annotationsData.filter(annotation => ids.includes(annotation.id));
            console.log("Filtered annotations data for IDs", ids, ":", annotationsDataSubset);
            if (annotationsDataSubset.length > 0) {
                annotationViewComponent.setAttribute("annotations-data-subset", JSON.stringify(annotationsDataSubset));
                annotationViewComponent.setAttribute("subset-lock", "locked");
            }
        }
    }


    annotationViewComponent.addEventListener("annotation-selected", async (event) => {
        // TODO: The Event Listener has to be reattached if doc changes
        let annotationData = await composeAnnotationData(event.detail.annotationData, doc);
        console.log("Annotation Data to be set:", annotationData);
        annotationViewComponent.setAttribute("annotation-data", JSON.stringify(annotationData));
        annotationViewComponent.setAttribute("current-page", "annotation");
    });
    return annotationViewComponent;
}

/**
 * Enriches an annotation data object with its full text and preview participants
 * by fetching both from the backend.
 * @param {Object} annotationData - The base annotation data object (mutated in place)
 * @param {string} docUri - The document URI (used to construct the full annotation URI)
 * @returns {Promise<Object>} The enriched annotation data object
 */
async function composeAnnotationData(annotationData, docUri) {
    let uri = docUri + "#" + annotationData.id;

    // Annotation Text
    let annotationTextFull = await getAnnotationText(appState.edition.doc, uri, appState.language);
    let parser = new DOMParser();
    let doc = parser.parseFromString(annotationTextFull, 'text/html');
    let annotationTextSnippet = doc.querySelector('p')?.innerHTML;
    annotationTextSnippet = annotationTextSnippet.trim();
    annotationData.text = annotationTextSnippet;

    // Annotation Previews
    let annotationPreviewsData = await getAnnotationPreviews(appState.edition.doc, uri, appState.language);
    annotationData.previews = annotationPreviewsData.participants;

    return annotationData;
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

function switchView(newView, target, config = {}) {
    console.log(`Switching to view: ${newView} for target: ${target}`);
}

/**
 * Builds the view content area for the given view type and link data.
 * @param {Object} linkData - Link target data passed to the view component
 * @param {string} newView - The view type to render (e.g. `"annotationView"`)
 * @returns {HTMLElement} The view content container element
 */
function buildViewContent(newView, target, config = {}) {
    let viewContent = document.createElement("div");
    viewContent.id = "view-content";
    switch (newView) {
        case "annotationView":
            buildAnnotationViewWebComponent(target, config).then(component => {
                viewContent.appendChild(component);
            });
            break;
        default:
            console.warn(`Unknown view type: ${newView}`);
    }
    return viewContent;
}

function buildViewControlBar(newView) {
    let controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    switch (newView) {
        case "annotationView":
            buildAnnotationViewControlBar().then(controlBar => {
                controlBarContainer.appendChild(controlBar);
            });
            break;
        default:
            console.warn(`No control bar defined for view type: ${newView}`);
    }
    return controlBarContainer;
}

async function buildAnnotationViewControlBar() {
    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");

    const spacer = document.createElement("edirom-spacer-widget");
    controlBar.appendChild(spacer);

    const button = document.createElement("edirom-button-widget");
    button.setAttribute("icon-name", "lock");
    controlBar.appendChild(button);

    return controlBar;
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