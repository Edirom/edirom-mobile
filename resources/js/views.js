import { swapContentContainerContent } from "./main.js";
import { getAnnotations } from "./api.js";

export function loadViews(linkData, activeView = null) {
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
    swapContentContainerContent(buildViewsContainer(linkData, activeView, availableViews));
}

function buildViewsContainer(linkData, activeView, availableViews) {
    let viewsContainer = document.createElement("div");
    viewsContainer.id = "views-container";

    viewsContainer.appendChild(buildViewHeader(linkData, availableViews, activeView));
    viewsContainer.appendChild(buildViewContent(linkData, activeView));
    return viewsContainer;
}

async function buildAnnotationViewWebComponent(docUri) {
    const annotationViewComponent = document.createElement("edirom-annotation-view");
    annotationViewComponent.setAttribute("layout-mode", "mobile");
    let annotationsData = await getAnnotations(document.EDITION_URI, docUri);
    if (annotationsData) {
        annotationViewComponent.setAttribute("annotations-data", JSON.stringify(annotationsData.annotations));
    }
    return annotationViewComponent;
}

function buildViewHeader(linkData, availableViews, activeView) {
    const viewHeaderContainer = document.createElement("div");
    viewHeaderContainer.id = "view-header-container";

    const viewHeader = document.createElement("div");
    viewHeader.id = document.VIEW_HEADER_ID;

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
            loadView(linkData, selectedView);
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

function buildViewContent(linkData, newView) {
    console.log("Link Data in buildViewContent:", linkData);
    let viewContent = document.createElement("div");
    viewContent.id = "view-content";
    switch (newView) {
        case "annotationView":
            buildAnnotationViewWebComponent(linkData.doc).then(component => {
                viewContent.appendChild(component);
            });
            break;
        default:
            console.warn(`Unknown view type: ${newView}`);
    }
    return viewContent;
}

function reduceToAvailableViews(views) {
    var availableViews = [];
    views.forEach(view => {
        if (document.CURRENTLY_AVAILABLE_VIEWS.includes(view.type)) {
            availableViews.push(view);
        }
    });
    return availableViews;
}