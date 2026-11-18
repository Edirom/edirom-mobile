/**
 * Which view a view window opens with. Pure decisions, no browser dependencies (so it also runs in Node, see
 * ../../tests).
 *
 * The rule is the one Edirom-Frontend's Desktop uses (`Window.loadInternalId` weighs each view with
 * `getWeightForInternalLink`): the `#xml:id` of a link implies the viewer, e.g. a page or a measure is shown in
 * the facsimile view and an annotation in the annotation view. This is what lets a link such as
 * `source.xml#page1` open the same viewer on both UIs, without the link having to name a viewer.
 */

/**
 * The view an id of a given type is shown in, by the `internalIdType` that `getLinkTarget` reports (the local name
 * of the element the id belongs to). Types that are not listed here (and are not "unknown") are elements of a
 * text and belong to the text view.
 */
const VIEW_FOR_ID_TYPE = {
    measure: "sourceView",
    zone: "sourceView",
    surface: "sourceView",
    graphic: "sourceView",
    annot: "annotationView"
};

/** What `getLinkTarget` reports for an id that does not resolve to an element, or for a link without an id. */
const UNKNOWN_ID_TYPE = "unknown";

/**
 * The view that the type of an id implies, or null if it implies none.
 * @param {string|null|undefined} internalIdType - The `internalIdType` of the link target
 * @returns {string|null}
 */
export function viewForIdType(internalIdType) {
    if (!internalIdType || internalIdType === UNKNOWN_ID_TYPE) return null;
    return VIEW_FOR_ID_TYPE[internalIdType] ?? "textView";
}

/**
 * Chooses the view a view window opens with. In this order:
 * 1. the view that was asked for explicitly (e.g. when "Back" returns to a view window), if the document has it
 * 2. the view that the type of the link's id implies, if the document has it
 * 3. the last view marked as default (as before), if the document has it
 * 4. the first view of the document
 *
 * Only views the document offers *and* Mobile can show are considered. A default view that Mobile cannot show
 * (e.g. the Verovio view) must not win over one it can.
 * @param {Object} options
 * @param {string|null} [options.requested=null] - A view type that is asked for explicitly
 * @param {string|null} [options.internalIdType=null] - The `internalIdType` of the link target
 * @param {{type: string, defaultView?: boolean}[]} options.availableViews - The views to choose from
 * @returns {string|null} The view type, or null if there is no view to choose from
 */
export function chooseInitialView({ requested = null, internalIdType = null, availableViews }) {
    if (!Array.isArray(availableViews) || availableViews.length === 0) return null;
    const has = (type) => availableViews.some(view => view.type === type);

    if (requested && has(requested)) return requested;

    const implied = viewForIdType(internalIdType);
    if (implied && has(implied)) return implied;

    const defaults = availableViews.filter(view => view.defaultView === true);
    return (defaults.length > 0 ? defaults[defaults.length - 1] : availableViews[0]).type;
}
