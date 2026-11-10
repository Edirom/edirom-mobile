import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { appConfig, appState } from "../resources/js/config.js";
import { applyLanguage, getLanguage, getLangString, onLanguageApplied } from "../resources/js/languageController.js";

const realFetch = globalThis.fetch;
mock.method(console, "log", () => {});
mock.method(console, "error", () => {});
appConfig.backendUrl = "http://backend.test/";

const KEYS = {
    de: { greeting: "Hallo {0}, {1}!", only_de: "nur deutsch" },
    en: { greeting: "Hello {0}, {1}!" }
};

let requests;
let preferences;
let failing;

/** The backend: answers getPreferences.xql with `preferences` and getLanguageFile.xql with the KEYS of `lang`. */
function stubBackend() {
    requests = [];
    globalThis.fetch = async (url) => {
        const parsed = new URL(url);
        requests.push(parsed);
        if (failing) return { ok: false, status: 500, json: async () => { throw new Error("no json"); } };
        const endpoint = parsed.pathname.split("/").pop();
        const body = endpoint === "getPreferences.xql"
            ? preferences
            : { lang: parsed.searchParams.get("lang"), version: "1.0", keys: KEYS[parsed.searchParams.get("lang")] };
        return { ok: true, status: 200, json: async () => body };
    };
}

const requestsTo = (endpoint) => requests.filter((url) => url.pathname.endsWith(endpoint));

beforeEach(() => {
    preferences = { application_language: "de" };
    failing = false;
    stubBackend();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    delete globalThis.location;
});

test("before anything is loaded, getLangString returns the fallback, or the key", () => {
    assert.equal(getLangString("greeting", "Fallback"), "Fallback");
    assert.equal(getLangString("greeting"), "greeting");
    assert.equal(getLangString("greeting", "Hi {0}", "Ada"), "Hi Ada");
});

test("applyLanguage without an edition uses the default preferences and loads both languages", async () => {
    const applied = [];
    onLanguageApplied((language) => applied.push(language));

    assert.equal(await applyLanguage(), "de");

    assert.equal(appState.language, "de");
    assert.equal(getLanguage(), "de");
    assert.deepEqual(applied, ["de"]);
    assert.equal(requestsTo("getPreferences.xql").length, 1);
    assert.deepEqual(requestsTo("getLanguageFile.xql").map((url) => url.searchParams.get("lang")).sort(), ["de", "en"]);
    for (const url of requests) assert.equal(url.searchParams.get("edition"), "");
});

test("getLangString translates into the language that is shown, and fills the placeholders", () => {
    assert.equal(getLangString("greeting", "x", "Ada", "Bob"), "Hallo Ada, Bob!");
    assert.equal(getLangString("greeting", "x", "Ada"), "Hallo Ada, {1}!");
    assert.equal(getLangString("only_de"), "nur deutsch");
    assert.equal(getLangString("missing", "Fallback {0}", 7), "Fallback 7");
    assert.equal(getLangString("missing"), "missing");
});

test("an edition whose preference sets another language changes the language and the strings", async () => {
    preferences = { application_language: "en" };
    const applied = [];
    onLanguageApplied((language) => applied.push(language));

    assert.equal(await applyLanguage("ed-1"), "en");

    assert.equal(appState.language, "en");
    assert.equal(getLangString("greeting", "x", "Ada", "Bob"), "Hello Ada, Bob!");
    // a key missing in this language is not taken from the other one
    assert.equal(getLangString("only_de", "fallback"), "fallback");
    assert.equal(applied.at(-1), "en");
    for (const url of requests) assert.equal(url.searchParams.get("edition"), "ed-1");
});

test("applying the same edition again requests nothing, but still tells the listeners", async () => {
    await applyLanguage("ed-1");
    let calls = 0;
    onLanguageApplied(() => calls++);
    requests.length = 0;

    await applyLanguage("ed-1");

    assert.equal(requests.length, 0);
    assert.equal(calls, 1);
});

test("the language of the URL wins over the edition's preference", async () => {
    globalThis.location = { search: "?lang=de" };
    preferences = { application_language: "en" };

    assert.equal(await applyLanguage("ed-2"), "de");
    assert.equal(appState.language, "de");
});

test("a failed load keeps the cached strings and is retried next time", async () => {
    await applyLanguage("ed-3");

    failing = true;
    assert.equal(await applyLanguage("ed-4"), "en"); // no preferences: English
    assert.equal(getLangString("greeting", "x", "Ada", "Bob"), "Hello Ada, Bob!"); // the strings loaded before

    failing = false;
    requests.length = 0;
    await applyLanguage("ed-4");
    assert.ok(requests.length > 0, "the load was not remembered as done");
});
