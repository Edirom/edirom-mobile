import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { appConfig, appState } from "../resources/js/config.js";
import * as api from "../resources/js/api.js";

const realFetch = globalThis.fetch;
mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

let calls;

beforeEach(() => {
    appConfig.backendUrl = "http://backend.test/";
    appState.language = "en";
    calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: new URL(url), options });
        return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    };
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

// Every request function with arguments that it can be called with. `explicit` marks those that take the
// language as an argument.
const REQUESTS = [
    ["getPages.xql", () => api.getPages("uri", "ed")],
    ["getMovements.xql", () => api.getMovements("uri", "ed")],
    ["getMeasures.xql", () => api.getMeasures("uri", "ed", "mdiv")],
    ["getMeasurePage.xql", () => api.getMeasurePage("id", "ed", "1")],
    ["getMeasuresOnPage.xql", () => api.getMeasuresOnPage("uri", "page", "ed")],
    ["getText.xql", () => api.getText("uri", "ed")],
    ["getAnnotations.xql", () => api.getAnnotations("ed", "uri")],
    ["getConcordances.xql", () => api.getConcordances("ed", "work")],
    ["getEdition.xql", () => api.getEdition("ed")],
    ["getEditionURI.xql", () => api.getEditionUri("ed")],
    ["getEditions.xql", () => api.getEditions()],
    ["getWorks.xql", () => api.getWorks("ed")],
    ["getPreferences.xql", () => api.getPreferences("ed")]
];

const EXPLICIT = [
    ["getAnnotationText.xql", (lang) => api.getAnnotationText("ed", "uri", lang)],
    ["getAnnotationPreviews.xql", (lang) => api.getAnnotationPreviews("ed", "uri", lang)],
    ["getNavigatorConfig.xql", (lang) => api.getNavigatorConfig("edId", "work", lang, "ed")],
    ["getLinkTarget.xql", (lang) => api.getLinkTarget("uri", lang, "ed")],
    ["getLanguageFile.xql", (lang) => api.getLanguageFile(lang, "ed")]
];

for (const [endpoint, request] of REQUESTS) {
    test(`${endpoint} sends the current language as lang`, async () => {
        await request();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url.pathname, `/data/xql/${endpoint}`);
        assert.equal(calls[0].url.searchParams.get("lang"), "en");

        appState.language = "de";
        await request();
        assert.equal(calls[1].url.searchParams.get("lang"), "de");
    });
}

for (const [endpoint, request] of EXPLICIT) {
    test(`${endpoint} sends the lang it is given`, async () => {
        await request("de");
        assert.equal(calls[0].url.pathname, `/data/xql/${endpoint}`);
        assert.equal(calls[0].url.searchParams.get("lang"), "de");
    });
}

test("getLinkTargets sends lang and the edition in the POST body", async () => {
    await api.getLinkTargets(["a#1", "b#2"], "de", "ed");
    const { url, options } = calls[0];
    assert.equal(url.pathname, "/data/xql/getLinkTargets.xql");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("lang"), "de");
    assert.equal(options.body.get("edition"), "ed");
    assert.deepEqual(options.body.getAll("uri"), ["a#1", "b#2"]);
});

test("the parameters survive encoding", async () => {
    await api.getPages("xmldb:exist:///db/a b.xml#x", "ed&1");
    assert.equal(calls[0].url.searchParams.get("uri"), "xmldb:exist:///db/a b.xml#x");
    assert.equal(calls[0].url.searchParams.get("edition"), "ed&1");
});

test("the preferences and language files are not aborted with the content loading", async () => {
    await api.getPreferences("ed");
    await api.getLanguageFile("de", "ed");
    await api.getPages("uri", "ed");
    assert.equal(calls[0].options.signal, null);
    assert.equal(calls[1].options.signal, null);
    assert.ok(calls[2].options.signal instanceof AbortSignal);
});

test("getPreferences and getLanguageFile ask for JSON and pass the edition", async () => {
    await api.getPreferences("ed");
    await api.getLanguageFile("de", "ed");
    for (const { url } of calls) {
        assert.equal(url.searchParams.get("mode"), "json");
        assert.equal(url.searchParams.get("edition"), "ed");
    }
});
