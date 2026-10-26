import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { appConfig } from "../resources/js/config.js";
import {
    normalizeLanguage,
    getURLParameter,
    getExplicitLanguage,
    initPreferences,
    getPreference
} from "../resources/js/preferenceController.js";

const realFetch = globalThis.fetch;
mock.method(console, "log", () => {});
mock.method(console, "error", () => {});
appConfig.backendUrl = "http://backend.test/";

/** Makes `fetch` answer with `prefs` (or a server error if it is null) and returns the requested URLs. */
function stubPreferences(prefs) {
    const requests = [];
    globalThis.fetch = async (url) => {
        requests.push(String(url));
        return prefs === null
            ? { ok: false, status: 500, json: async () => { throw new Error("no json"); } }
            : { ok: true, status: 200, json: async () => prefs };
    };
    return requests;
}

/** Sets the query string of the page URL, like `?lang=de`. */
function setSearch(search) {
    globalThis.location = { search };
}

afterEach(() => {
    globalThis.fetch = realFetch;
    delete globalThis.location;
});

test("normalizeLanguage accepts the supported languages, ignoring case and region", () => {
    assert.equal(normalizeLanguage("de"), "de");
    assert.equal(normalizeLanguage("EN"), "en");
    assert.equal(normalizeLanguage("de-AT"), "de");
    assert.equal(normalizeLanguage("en_GB"), "en");
    assert.equal(normalizeLanguage(" de "), "de");
});

test("normalizeLanguage rejects everything else", () => {
    for (const value of ["fr", "", "xx-de", null, undefined, 5, {}]) {
        assert.equal(normalizeLanguage(value), null, String(value));
    }
});

test("getURLParameter reads the query string, and copes with there being no location", () => {
    assert.equal(getURLParameter("lang"), null);
    setSearch("?edition=a&lang=de");
    assert.equal(getURLParameter("lang"), "de");
    assert.equal(getURLParameter("work"), null);
});

test("before the preferences are loaded the language is the URL's, else English, and nothing throws", () => {
    assert.equal(getPreference("application_language"), "en");
    setSearch("?lang=de");
    assert.equal(getPreference("application_language"), "de");
});

test("initPreferences requests the preferences of the edition as JSON", async () => {
    const requests = stubPreferences({});
    assert.equal(await initPreferences("xmldb:exist:///db/editions/ed.xml"), true);
    const url = new URL(requests[0]);
    assert.equal(url.origin + url.pathname, "http://backend.test/data/xql/getPreferences.xql");
    assert.equal(url.searchParams.get("mode"), "json");
    assert.equal(url.searchParams.get("edition"), "xmldb:exist:///db/editions/ed.xml");
});

test("the language is the edition's preference when the URL has none", async () => {
    stubPreferences({ application_language: "de" });
    await initPreferences("ed");
    assert.equal(getPreference("application_language"), "de");

    stubPreferences({ application_language: "en" });
    await initPreferences("ed");
    assert.equal(getPreference("application_language"), "en");
});

test("the language of the URL wins over the preference", async () => {
    stubPreferences({ application_language: "de" });
    await initPreferences("ed");
    setSearch("?lang=en");
    assert.equal(getPreference("application_language"), "en");
    setSearch("?lang=EN-us");
    assert.equal(getPreference("application_language"), "en");
});

test("an unsupported language in the URL falls through to the preference", async () => {
    stubPreferences({ application_language: "de" });
    await initPreferences("ed");
    setSearch("?lang=fr");
    assert.equal(getPreference("application_language"), "de");
});

test("an unsupported or missing preference falls through to English", async () => {
    stubPreferences({ application_language: "fr" });
    await initPreferences("ed");
    assert.equal(getPreference("application_language"), "en");

    stubPreferences({});
    await initPreferences("ed");
    assert.equal(getPreference("application_language"), "en");
});

test("a failed request leaves the defaults: English, or the URL's language", async () => {
    stubPreferences({ application_language: "de" });
    await initPreferences("ed");
    stubPreferences(null);
    assert.equal(await initPreferences("ed"), false);
    assert.equal(getPreference("application_language"), "en");
    setSearch("?lang=de");
    assert.equal(getPreference("application_language"), "de");
});

test("other preferences are returned as they are", async () => {
    stubPreferences({ some_key: "value" });
    await initPreferences("ed");
    assert.equal(getPreference("some_key"), "value");
    assert.equal(getPreference("missing_key"), undefined);
});

test("getExplicitLanguage only knows what the URL asks for", async () => {
    stubPreferences({ application_language: "de" });
    await initPreferences("ed");
    assert.equal(getExplicitLanguage(), null);
    setSearch("?lang=fr");
    assert.equal(getExplicitLanguage(), null);
    setSearch("?lang=en");
    assert.equal(getExplicitLanguage(), "en");
});
