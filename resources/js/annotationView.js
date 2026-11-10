import { appState } from "./config.js";
import { getLangString } from "./languageController.js";
import { getAnnotations, getAnnotationText, getAnnotationPreviews } from "./api.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { showContentLoading, hideContentLoading } from "./loading.js";

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
    // Single-ID target to auto-navigate to on the next setData call, or null.
    // Set by update(), consumed once by setData() (mirrors textView's _scrollToId).
    let _pendingJumpAnnotationId = null;
    // How the detail page was reached: true if the user tapped an annotation in the list (Back then returns to
    // the list), false if it was opened directly, by a link or a jump to a single annotation.
    let detailEnteredFromList = false;
    // State to bring back with the next setData call (see restoreState), or null.
    let _pendingRestore = null;

    const controlBar = document.createElement("edirom-control-bar");
    controlBar.classList.add("web-component");
    controlBar.setAttribute("layout-mode", "mobile");
    controlBar.setAttribute("gap", "10px");

    const spacer = document.createElement("edirom-spacer-widget");

    // ANNOTATION STEP SPIN BOX

    const spinBox = document.createElement("edirom-spin-box-widget");
    spinBox.id = "annotation-step-spin-box";
    spinBox.setAttribute("label", getLangString("Annotation", "Annotation"));
    spinBox.classList.add("hidden");

    async function navigateToAnnotation(annotation) {
        let doc = splitTargetIntoDocAndIds(target).doc;
        const loadingToken = showContentLoading();
        let annotationData;
        try {
            annotationData = await composeAnnotationData(annotation, doc);
        } finally {
            hideContentLoading(loadingToken);
        }
        annotationViewComponent.setAttribute("annotation-data", JSON.stringify(annotationData));
        annotationViewComponent.setAttribute("current-page", "annotation");
    }

    annotationViewComponent.addEventListener("annotation-selected", (event) => {
        detailEnteredFromList = true;
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
            detailEnteredFromList = false;
            spinBox.classList.add("hidden");
        }
    });

    /**
     * Brings back the state captured by `captureState`: the detail page of the annotation (if it is still in
     * the data), else the list at its scroll position.
     */
    function applyRestoredState({ page, annotationId, enteredFromList, listScrollTop }, annotations) {
        const annotation = page === "annotation" ? annotations.find(a => a.id === annotationId) : null;
        if (annotation) {
            detailEnteredFromList = enteredFromList === true;
            navigateToAnnotation(annotation);
        } else if (Number.isFinite(listScrollTop) && listScrollTop > 0) {
            // The component scrolls itself to the top when it renders the list, so this comes after
            requestAnimationFrame(() => { annotationViewComponent.scrollTop = listScrollTop; });
        }
    }

    function setData(annotations, { isNavigationUpdate = false } = {}) {
        currentAnnotationsData = annotations;
        annotationViewComponent.setAttribute("annotations-data", JSON.stringify(annotations));

        if (_pendingRestore) {
            const restoredState = _pendingRestore;
            _pendingRestore = null;
            _pendingJumpAnnotationId = null;
            applyRestoredState(restoredState, annotations);
            return;
        }

        if (isNavigationUpdate && _pendingJumpAnnotationId) {
            const alreadyShowing = annotationViewComponent.currentPage === "annotation"
                && annotationViewComponent.annotationData?.id === _pendingJumpAnnotationId;
            if (!alreadyShowing) {
                const matchedAnnotation = annotations.find(a => a.id === _pendingJumpAnnotationId);
                if (matchedAnnotation) {
                    detailEnteredFromList = false;
                    navigateToAnnotation(matchedAnnotation);
                    return;
                }
            }
        }

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
        update: async (target) => {
            const { mainData, subsetData, jumpAnnotationId } = await updateAnnotationViewWebComponent(target, annotationViewComponent);
            _pendingJumpAnnotationId = jumpAnnotationId;
            return { mainData, subsetData };
        },
        setData,

        // --- "Back" navigation (see buildView in views.js) ---

        /** The page the view is on: the list or the detail page of an annotation. */
        captureState() {
            const page = annotationViewComponent.currentPage;
            return {
                page,
                annotationId: page === "annotation" ? annotationViewComponent.annotationData?.id ?? null : null,
                enteredFromList: detailEnteredFromList,
                listScrollTop: page === "annotations" ? annotationViewComponent.scrollTop : 0
            };
        },

        restoreState(state) {
            _pendingRestore = state && typeof state === "object" ? state : null;
        },

        /**
         * An annotation that was opened by a link from another view (an annotation badge, a link in a text) is
         * left by Back straight away, back to that view: the user never saw the list. The component is not
         * asked then, as it would only go to the list. In all other cases, e.g. when the annotation view was
         * opened from the navigator or the detail page was reached from the list, the component handles the
         * Back as usual.
         */
        leaveOnBack({ returnsToView }) {
            return returnsToView === true
                && annotationViewComponent.currentPage === "annotation"
                && !detailEnteredFromList;
        }
    };
}

/**
 * Fetches the annotations list for the given target URI. If not currently on
 * the annotation detail page, resets the view to the annotations list.
 * Returns the full dataset and, if the target contains fragment IDs, the
 * matching subset (built for any non-empty ids, so the user can manually
 * activate filtered mode even for a single-ID target — see views.js
 * applyViewData's defaultFiltered). A single fragment ID additionally yields
 * `jumpAnnotationId`, so the caller can navigate straight to that annotation
 * without the list starting out restricted. Data is not written to the
 * component; the caller is responsible for calling `setData` with the
 * appropriate dataset.
 * @param {string} target - The document URI (with optional `#id` fragment)
 * @param {HTMLElement} annotationViewComponent - The annotation view web component
 * @returns {Promise<{ mainData: Object[]|null, subsetData: Object[]|null, jumpAnnotationId: string|null }>}
 */
async function updateAnnotationViewWebComponent(target, annotationViewComponent) {
    let { doc, ids } = splitTargetIntoDocAndIds(target);

    const annotationsData = (await getAnnotations(appState.edition.doc, doc)).annotations;

    if (!annotationsData) return { mainData: null, subsetData: null, jumpAnnotationId: null };

    let subsetData = null;
    if (ids.length > 0) {
        const subset = annotationsData.filter(annotation => ids.includes(annotation.id));
        if (subset.length > 0) {
            subsetData = subset;
        }
    }

    const jumpAnnotationId = ids.length === 1 && annotationsData.some(a => a.id === ids[0])
        ? ids[0]
        : null;

    // Only reset to the list page if not currently on the annotation detail page,
    // and we're not about to auto-navigate straight to a single matched
    // annotation (avoids a flash of the list before the detail page loads).
    // When on the detail page, setData decides: stay if the current annotation
    // is still in the new data, or switch to the list if it is not.
    if (annotationViewComponent.currentPage !== "annotation" && !jumpAnnotationId) {
        annotationViewComponent.setAttribute("current-page", "annotations");
    }

    return { mainData: annotationsData, subsetData, jumpAnnotationId };
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
