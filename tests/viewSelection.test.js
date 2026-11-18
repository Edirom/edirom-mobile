import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseInitialView, viewForIdType } from "../resources/js/viewSelection.js";

const SOURCE = { type: "sourceView", defaultView: true };
const ANNOTATIONS = { type: "annotationView", defaultView: true };
const TEXT = { type: "textView" };

test("the type of an id implies the view, like on Desktop", () => {
    for (const type of ["measure", "zone", "surface", "graphic"]) {
        assert.equal(viewForIdType(type), "sourceView", type);
    }
    assert.equal(viewForIdType("annot"), "annotationView");
    // An element of a text
    assert.equal(viewForIdType("div"), "textView");
});

test("an unknown or missing id type implies no view", () => {
    assert.equal(viewForIdType("unknown"), null);
    assert.equal(viewForIdType(""), null);
    assert.equal(viewForIdType(null), null);
    assert.equal(viewForIdType(undefined), null);
});

test("the view that is asked for wins, if the document has it", () => {
    const views = [SOURCE, ANNOTATIONS, TEXT];
    assert.equal(chooseInitialView({ requested: "textView", internalIdType: "measure", availableViews: views }), "textView");
    // ... otherwise the choice goes on
    assert.equal(chooseInitialView({ requested: "audioView", internalIdType: "annot", availableViews: views }), "annotationView");
});

test("the type of the id decides over the default view", () => {
    // Both are marked as default, and the last one wins without an id: a page must still open the facsimile
    const views = [SOURCE, ANNOTATIONS];
    assert.equal(chooseInitialView({ internalIdType: "surface", availableViews: views }), "sourceView");
    assert.equal(chooseInitialView({ internalIdType: "annot", availableViews: views }), "annotationView");
});

test("without an id the last default view wins, as before", () => {
    const views = [SOURCE, ANNOTATIONS];
    assert.equal(chooseInitialView({ availableViews: views }), "annotationView");
    assert.equal(chooseInitialView({ internalIdType: "unknown", availableViews: views }), "annotationView");
});

test("an implied view the document does not have falls back to the default", () => {
    assert.equal(chooseInitialView({ internalIdType: "annot", availableViews: [SOURCE, TEXT] }), "sourceView");
});

test("only views Mobile can show are considered: an unsupported default does not win", () => {
    // The caller passes the available views, i.e. without e.g. the Verovio view. A default that is not among
    // them cannot be chosen.
    assert.equal(chooseInitialView({ availableViews: [{ type: "sourceView", defaultView: true }, TEXT] }), "sourceView");
});

test("without a default view the first one is chosen", () => {
    assert.equal(chooseInitialView({ availableViews: [TEXT, { type: "annotationView" }] }), "textView");
});

test("no views to choose from gives null", () => {
    assert.equal(chooseInitialView({ availableViews: [] }), null);
    assert.equal(chooseInitialView({ availableViews: undefined }), null);
});
