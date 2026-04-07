import { appState } from "./config.js";
import { getAnnotations, getAnnotationText, getAnnotationPreviews } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";

/**
 * Builds the annotation view web component and its control bar together,
 * wiring up bidirectional event listeners via direct variable references.
 * Returns the content container, control bar container, and an update
 * function for loading annotation data without rebuilding the view.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {Object} [config={}] - Additional link config (currently unused)
 * @returns {{ content: HTMLElement, controlBar: HTMLElement, update: function, removeSubset: function }}
 */
export function buildAnnotationView(target, config = {}) {
    const annotationViewComponent = document.createElement("edirom-annotation-view");
    annotationViewComponent.classList.add("web-component");
    annotationViewComponent.setAttribute("layout-mode", "mobile");

    const content = document.createElement("div");
    content.id = "view-content";
    content.appendChild(annotationViewComponent);

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");
    controlBar.appendChild(spacer);

    // ANNOTATION STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "annotation-step-spin-box";
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
        const effectiveData = annotationViewComponent.effectiveAnnotationsData;
        const annotation = effectiveData.find(a => String(a.pos) === requestedPos);
        if (!annotation) {
            console.warn(`No annotation found with pos "${requestedPos}".`);
            return;
        }
        navigateToAnnotation(annotation);
    });
    controlBar.appendChild(spinBox);

    annotationViewComponent.addEventListener("annotation-data-changed", (event) => {
        spinBox.setAttribute("current-step", String(event.detail.annotationData.pos));
    });

    annotationViewComponent.addEventListener("current-page-changed", (event) => {
        if (event.detail.value === "annotation") {
            const effectiveData = annotationViewComponent.effectiveAnnotationsData;
            spinBox.setAttribute("steps-data", JSON.stringify(effectiveData.map(a => a.pos)));
            spinBox.classList.remove("hidden");
        } else {
            spinBox.classList.add("hidden");
        }
    });

    annotationViewComponent.addEventListener("effective-annotations-data-changed", (event) => {
        if (annotationViewComponent.currentPage === "annotation") {
            const newAnnotations = event.detail.annotations;
            spinBox.setAttribute("steps-data", JSON.stringify(newAnnotations.map(a => a.pos)));

            const currentAnnotationId = annotationViewComponent.annotationData?.id;
            const currentStillValid = newAnnotations.some(a => a.id === currentAnnotationId);

            if (currentStillValid) {
                // Current annotation is still available: update spin box step
                const currentAnnotation = newAnnotations.find(a => a.id === currentAnnotationId);
                spinBox.setAttribute("current-step", String(currentAnnotation.pos));
            } else {
                // Current annotation is no longer in the effective data: switch to list
                annotationViewComponent.setAttribute("current-page", "annotations");
            }
        }
    });

    // LOCK BUTTON

    const button = document.createElement("edirom-button-widget");
    button.id = "annotation-lock-button";
    let buttonStates = [
        { name: "locked", iconName: "lock" },
        { name: "unlocked", iconName: "lock_open_right" },
    ];
    button.setAttribute("states-data", JSON.stringify(buttonStates));

    let lockButtonInitialState = annotationViewComponent.subsetLockState;
    if (lockButtonInitialState) {
        button.setAttribute("current-state", lockButtonInitialState);
    }
    else {
        button.classList.add("hidden");
    }

    button.addEventListener("button-state-requested", (event) => {
        const requestedState = event.detail.requestedState;
        if (requestedState === "locked") {
            annotationViewComponent.setAttribute("subset-lock", "locked");
        } else if (requestedState === "unlocked") {
            annotationViewComponent.setAttribute("subset-lock", "unlocked");
        } else {
            console.warn(`Unknown lock state requested: ${requestedState}`);
        }
    });
    controlBar.appendChild(button);

    annotationViewComponent.addEventListener("subset-lock-changed", (event) => {
        if (["locked", "unlocked"].includes(event.detail.value)) {
            button.classList.remove("hidden");
            button.setAttribute("current-state", event.detail.value);
        }
        else if (event.detail.value === null) {
            button.classList.add("hidden");
        }
    });

    const controlBarContainer = document.createElement("div");
    controlBarContainer.id = "view-control-bar-container";
    controlBarContainer.appendChild(controlBar);

    return {
        content,
        controlBar: controlBarContainer,
        update: (target, viewContentDiv) => {
            updateAnnotationViewWebComponent(target, viewContentDiv);
        },
        removeSubset: () => {
            annotationViewComponent.removeAttribute("annotations-data-subset");
        }
    };
}

/**
 * Fetches the annotations list for the given target URI and pushes it to the
 * `<edirom-annotation-view>` element found inside `viewContentDiv`. If the
 * target contains fragment IDs, the matching subset is also set and locked.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {HTMLElement} viewContentDiv - The container element holding the annotation view component
 * @returns {Promise<void>}
 */
async function updateAnnotationViewWebComponent(target, viewContentDiv) {
    const annotationViewComponent = viewContentDiv.querySelector("edirom-annotation-view");
    let { doc, ids } = splitTargetIntoDocAndIds(target);

    let annotationsData = (await getAnnotations(appState.edition.doc, doc)).annotations;

    if (annotationsData) {
        annotationViewComponent.setAttribute("annotations-data", JSON.stringify(annotationsData));

        // Only reset to the list page if not currently on the annotation detail page.
        // When on the detail page, the effective-annotations-data-changed handler
        // decides: stay if the current annotation is still in the new data, or
        // switch to the list if it is not.
        if (annotationViewComponent.currentPage !== "annotation") {
            annotationViewComponent.setAttribute("current-page", "annotations");
        }

        if (ids.length > 0) {
            let annotationsDataSubset = annotationsData.filter(annotation => ids.includes(annotation.id));
            if (annotationsDataSubset.length > 0) {
                annotationViewComponent.setAttribute("annotations-data-subset", JSON.stringify(annotationsDataSubset));
                annotationViewComponent.setAttribute("subset-lock", "locked");
            }
        }
    }
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
