import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { appConfig, setAppState } from "../resources/js/config.js";
import { initPreferences } from "../resources/js/preferenceController.js";
import { buildDesktopUrl } from "../resources/js/uiSwitch.js";

const realFetch = globalThis.fetch;
mock.method(console, "log", () => {});
mock.method(console, "info", () => {});
mock.method(console, "error", () => {});
appConfig.backendUrl = "http://backend.test/";

/** Pretends the page is at `/mobile/index.html` + `search`. */
function setLocation(search = "") {
    globalThis.location = { search };
}

/** Makes the backend answer getPreferences.xql with `prefs`, and loads them like an edition's preferences. */
async function loadPreferences(prefs) {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => prefs });
    await initPreferences("xmldb:exist:///db/apps/ed1");
}

afterEach(async () => {
    globalThis.fetch = realFetch;
    delete globalThis.location;
    delete globalThis.document;
    appConfig.wsUrl = "";
    setAppState({ edition: {}, work: {}, connection: null });
    await loadPreferences({});
});

test("the desktop URL goes to the Frontend's index.html and carries edition, work and connection", () => {
    setLocation();
    setAppState({ edition: { id: "ed1" }, work: { id: "w1" }, connection: "c1" });

    const url = new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html");

    assert.equal(url.origin + url.pathname, "https://edirom.test/index.html");
    assert.equal(url.searchParams.get("ui"), "desktop");
    assert.equal(url.searchParams.get("edition"), "ed1");
    assert.equal(url.searchParams.get("work"), "w1");
    assert.equal(url.searchParams.get("connection"), "c1");
});

test("the desktop URL leaves out what is not set", () => {
    setLocation();

    assert.equal(new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html").search, "?ui=desktop&lang=en");

    setAppState({ edition: { id: "ed1" }, work: { id: "w1" }, connection: null });
    const url = new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html");
    assert.equal(url.searchParams.has("connection"), false);
    // The session is the connector's: no placeholder while the connected workspace is disabled
    assert.equal(url.searchParams.has("session"), false);
});

test("the desktop URL carries the language that is shown, even if the page URL has no ?lang=", async () => {
    setLocation("");
    // The edition's preference decides
    await loadPreferences({ application_language: "de" });
    assert.equal(new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html").searchParams.get("lang"), "de");

    // No preference: the default
    await loadPreferences({});
    assert.equal(new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html").searchParams.get("lang"), "en");
});

test("an explicit ?lang= wins over the edition's preference in the desktop URL", async () => {
    await loadPreferences({ application_language: "de" });

    setLocation("?lang=en");
    assert.equal(new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html").searchParams.get("lang"), "en");

    // An unsupported code is ignored, like everywhere else in Mobile
    setLocation("?lang=fr");
    assert.equal(new URL(buildDesktopUrl(), "https://edirom.test/mobile/index.html").searchParams.get("lang"), "de");
});
