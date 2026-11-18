import { test } from "node:test";
import assert from "node:assert/strict";
import { paramsFromLocation, readDocumentLink } from "../resources/js/documentLink.js";

const DOC = "xmldb:exist:///db/apps/ed1/sources/source1.xml";
const params = (search) => new URLSearchParams(search);

test("a hash is merged into uri, like Edirom-Frontend does", () => {
    assert.equal(paramsFromLocation(`?uri=${encodeURIComponent(DOC)}`, "#page1").get("uri"), `${DOC}#page1`);
});

test("a uri with an id of its own keeps it, and the other parameters are left alone", () => {
    const result = paramsFromLocation(`?edition=ed1&uri=${encodeURIComponent(DOC + "#m1")}`, "#other");
    assert.equal(result.get("uri"), `${DOC}#m1`);
    assert.equal(result.get("edition"), "ed1");
});

test("without a uri or a hash nothing is merged", () => {
    assert.equal(paramsFromLocation("?edition=ed1", "#page1").has("uri"), false);
    assert.equal(paramsFromLocation(`?uri=${encodeURIComponent(DOC)}`, "").get("uri"), DOC);
    // A lone "#" is no id
    assert.equal(paramsFromLocation(`?uri=${encodeURIComponent(DOC)}`, "#").get("uri"), DOC);
});

test("readDocumentLink returns the document, with its id", () => {
    assert.equal(readDocumentLink(params(`uri=${encodeURIComponent(DOC)}`)), DOC);
    assert.equal(readDocumentLink(params(`uri=${encodeURIComponent(DOC + "#m1")}`)), `${DOC}#m1`);
});

test("readDocumentLink uses the first of several documents", () => {
    const other = "xmldb:exist:///db/apps/ed1/texts/text1.xml";
    assert.equal(readDocumentLink(params(`uri=${encodeURIComponent(`${DOC}#m1;${other}`)}`)), `${DOC}#m1`);
    assert.equal(readDocumentLink(params(`uri=${encodeURIComponent(`${other} ${DOC}`)}`)), other);
});

test("readDocumentLink ignores a config block of the link", () => {
    assert.equal(readDocumentLink(params(`uri=${encodeURIComponent(`${DOC}#m1[width=500]`)}`)), `${DOC}#m1`);
});

test("readDocumentLink ignores what is not a document in the database", () => {
    assert.equal(readDocumentLink(params("uri=https%3A%2F%2Fexample.org%2F")), null);
    assert.equal(readDocumentLink(params("uri=javascript%3Aalert(1)")), null);
    assert.equal(readDocumentLink(params("uri=relative%2Fdoc.xml")), null);
});

test("readDocumentLink gives null without a uri", () => {
    assert.equal(readDocumentLink(params("")), null);
    assert.equal(readDocumentLink(params("uri=")), null);
    assert.equal(readDocumentLink(params("uri=%20")), null);
});
