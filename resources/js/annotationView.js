import { appState } from "./config.js";
import { getAnnotations, getAnnotationText, getAnnotationPreviews } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

/**
 * Builds the annotation view web component and its control bar together,
 * wiring up bidirectional event listeners via direct variable references.
 * Returns the content container, control bar container, the control bar widget
 * element, an update function for fetching annotation data, and a setData
 * function for pushing data to the component.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config (currently unused)
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, controlBarWidget: HTMLElement, update: function, setData: function }}
 */
export function buildAnnotationView(target, config = {}) {
    const annotationViewComponent = document.createElement("edirom-annotation-view");
    annotationViewComponent.classList.add("web-component");
    annotationViewComponent.setAttribute("layout-mode", "mobile");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(annotationViewComponent);

    let currentAnnotationsData = [];

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");

    // ANNOTATION STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "annotation-step-spin-box";
    spinBox.setAttribute("label", "Annotation");
    spinBox.classList.add("hidden");

    async function navigateToAnnotation(annotation) {
        let doc = splitTargetIntoDocAndIds(target).doc;
        let annotationData = await composeAnnotationData(annotation, doc);
        annotationViewComponent.setAttribute("annotation-data", JSON.stringify(annotationData));
        annotationViewComponent.setAttribute("current-page", "annotation");
    }

    annotationViewComponent.addEventListener("annotation-selected", (event) => {
        navigateToAnnotation(event.detail.annotationData);
    });

    spinBox.addEventListener("spin-box-step-requested", (event) => {
        const requestedPos = event.detail.requestedStep;
        const annotation = currentAnnotationsData.find(a => String(a.pos) === requestedPos);
        if (!annotation) {
            console.warn(`No annotation found with pos "${requestedPos}".`);
            return;
        }
        navigateToAnnotation(annotation);
    });

    annotationViewComponent.addEventListener("annotation-data-changed", (event) => {
        spinBox.setAttribute("current-step", String(event.detail.annotationData.pos));
    });

    annotationViewComponent.addEventListener("current-page-changed", (event) => {
        if (event.detail.value === "annotation") {
            spinBox.setAttribute("steps-data", JSON.stringify(currentAnnotationsData.map(a => a.pos)));
            spinBox.classList.remove("hidden");
        } else {
            spinBox.classList.add("hidden");
        }
    });

    function setData(annotations) {
        currentAnnotationsData = annotations;
        annotationViewComponent.setAttribute("annotations-data", JSON.stringify(annotations));

        if (annotationViewComponent.currentPage === "annotation") {
            spinBox.setAttribute("steps-data", JSON.stringify(annotations.map(a => a.pos)));

            const currentAnnotationId = annotationViewComponent.annotationData?.id;
            const currentStillValid = annotations.some(a => a.id === currentAnnotationId);

            if (currentStillValid) {
                // Current annotation is still available: update spin box step
                const currentAnnotation = annotations.find(a => a.id === currentAnnotationId);
                spinBox.setAttribute("current-step", String(currentAnnotation.pos));
            } else {
                // Current annotation is no longer in the active data: switch to list
                annotationViewComponent.setAttribute("current-page", "annotations");
            }
        }
    }

    const controlBarContainer = document.createElement("div");
    // --- Control bar layout ---
    // [ spacer ] [ spinBox ]
    controlBar.appendChild(spacer);
    controlBar.appendChild(spinBox);

    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    return {
        content,
        controlBar: controlBarContainer,
        controlBarWidget: controlBar,
        update: (target) => updateAnnotationViewWebComponent(target, annotationViewComponent),
        setData
    };
}

/**
 * Fetches the annotations list for the given target URI. If not currently on
 * the annotation detail page, resets the view to the annotations list.
 * Returns the full dataset and, if the target contains fragment IDs, the
 * matching subset. Data is not written to the component; the caller is
 * responsible for calling `setData` with the appropriate dataset.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {HTMLElement} annotationViewComponent - The annotation view web component
 * @returns {Promise<{ mainData: Object[]|null, subsetData: Object[]|null }>}
 */
async function updateAnnotationViewWebComponent(target, annotationViewComponent) {
    let { doc, ids } = splitTargetIntoDocAndIds(target);

    const annotationsData = (await getAnnotations(appState.edition.doc, doc)).annotations;

    if (!annotationsData) return { mainData: null, subsetData: null };

    // Only reset to the list page if not currently on the annotation detail page.
    // When on the detail page, setData decides: stay if the current annotation
    // is still in the new data, or switch to the list if it is not.
    if (annotationViewComponent.currentPage !== "annotation") {
        annotationViewComponent.setAttribute("current-page", "annotations");
    }

    let subsetData = null;
    if (ids.length > 0) {
        const subset = annotationsData.filter(annotation => ids.includes(annotation.id));
        if (subset.length > 0) {
            subsetData = subset;
        }
    }

    return { mainData: annotationsData, subsetData };
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
