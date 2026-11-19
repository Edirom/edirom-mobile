import { test } from "node:test";
import assert from "node:assert/strict";
import { planContextNavigation } from "../resources/js/contextPlan.js";

// What Mobile has open: the edition `ed1` (doc URI as Desktop writes it) with the work `w1`, among others
const open = {
    edition: { id: "ed1", doc: "xmldb:exist:///db/apps/ed1/edition.xml" },
    work: { id: "w1", doc: "xmldb:exist:///db/apps/ed1/works/w1.xml" },
    hasWorks: true
};

test("the edition and work that are open need nothing: no reload", () => {
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: null }, open), "none");
});

test("the same edition and work with a connection only select the connection", () => {
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: "c1" }, open), "connection");
});

test("Desktop's doc URIs name the open edition and work as well as the short ids do", () => {
    const desktop = { editionId: open.edition.doc, workId: open.work.doc };
    assert.equal(planContextNavigation({ ...desktop, connectionId: null }, open), "none");
    assert.equal(planContextNavigation({ ...desktop, connectionId: "c1" }, open), "connection");
    // Mixed: one by doc URI, the other by id
    assert.equal(planContextNavigation({ editionId: open.edition.doc, workId: "w1", connectionId: null }, open), "none");
    assert.equal(planContextNavigation({ editionId: "ed1", workId: open.work.doc, connectionId: null }, open), "none");
});

test("another work of the open edition is initialized without the edition, once its works are loaded", () => {
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w2", connectionId: null }, open), "work");
    assert.equal(planContextNavigation({ editionId: open.edition.doc, workId: "w2", connectionId: "c1" }, open), "work");
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w2", connectionId: null }, { ...open, hasWorks: false }), "edition");
});

test("another edition, or no edition or work, is initialized from the edition on", () => {
    assert.equal(planContextNavigation({ editionId: "ed2", workId: "w1", connectionId: null }, open), "edition");
    assert.equal(planContextNavigation({ editionId: "ed2", workId: null, connectionId: null }, open), "edition");
    assert.equal(planContextNavigation({ editionId: null, workId: null, connectionId: null }, open), "edition");
    // The edition without a work means "its first work", which may not be the open one
    assert.equal(planContextNavigation({ editionId: "ed1", workId: null, connectionId: null }, open), "edition");
});

test("nothing is open yet, as at startup or on the edition selection page", () => {
    for (const current of [{ edition: {}, work: {} }, { edition: null, work: undefined }, {}]) {
        assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: null }, current), "edition");
        assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: "c1" }, current), "edition");
    }
});

test("an edition that is open without a work (an initialization that did not finish) is not taken for done", () => {
    const half = { edition: open.edition, work: {}, hasWorks: true };
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: null }, half), "work");
    assert.equal(planContextNavigation({ editionId: "ed1", workId: "w1", connectionId: null }, { ...half, hasWorks: false }), "edition");
});
