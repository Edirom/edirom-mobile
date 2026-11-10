import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { appConfig, appState, setAppState } from "../resources/js/config.js";
import {
    initConnectedWorkspace,
    getSyncedState,
    buildInviteUrl,
    updateConnectedWorkspaceInviteUrl,
    applyWorkspaceSession,
    isApplyingRemoteState
} from "../resources/js/connected-workspace.js";

mock.method(console, "log", () => {});
mock.method(console, "info", () => {});

/** Pretends the page is at `https://edirom.test/mobile/index.html` + `search`. */
function setLocation(search = "") {
    globalThis.window = { location: { origin: "https://edirom.test", pathname: "/mobile/index.html" } };
    globalThis.location = { search };
}

afterEach(() => {
    delete globalThis.window;
    delete globalThis.location;
    delete globalThis.document;
    appConfig.wsUrl = "";
    setAppState({ edition: {}, work: {}, connection: null });
});

test("the invite URL carries edition and work, and no connection", () => {
    setLocation();
    setAppState({ edition: { id: "ed1" }, work: { id: "w1" }, connection: "c1" });

    const url = new URL(buildInviteUrl());

    // The Frontend's index.html, which picks the UI by device type; not Mobile's own /mobile/index.html
    assert.equal(url.origin + url.pathname, "https://edirom.test/index.html");
    assert.equal(url.searchParams.get("edition"), "ed1");
    assert.equal(url.searchParams.get("work"), "w1");
    assert.equal(url.searchParams.has("connection"), false);
});

test("the invite URL leaves out what is not set, and has no session parameter of its own", () => {
    setLocation();

    assert.equal(buildInviteUrl(), "https://edirom.test/index.html");

    setAppState({ edition: { id: "ed1" } });
    const url = new URL(buildInviteUrl());
    assert.equal(url.searchParams.has("work"), false);
    // The connector adds `session` itself; a `workspaceSession` placeholder would end up next to it
    assert.equal(url.search, "?edition=ed1");
});

test("the invite URL passes on a language only if the current URL asked for a supported one", () => {
    setAppState({ edition: { id: "ed1" } });

    setLocation("?lang=de");
    assert.equal(new URL(buildInviteUrl()).searchParams.get("lang"), "de");

    setLocation("?lang=fr");
    assert.equal(new URL(buildInviteUrl()).searchParams.has("lang"), false);

    setLocation("");
    assert.equal(new URL(buildInviteUrl()).searchParams.has("lang"), false);
});

test("getSyncedState reads edition, work and connection from appState, with null for unset values", () => {
    assert.deepEqual(getSyncedState(), { edition: null, work: null, connection: null });

    setAppState({ edition: { id: "ed1" }, work: { id: "w1" }, connection: "c1" });
    assert.deepEqual(getSyncedState(), { edition: "ed1", work: "w1", connection: "c1" });
});

test("without a ws URL the container is removed and nothing is loaded", async () => {
    let removed = false;
    globalThis.document = {
        querySelector: (selector) => selector === "#edirom-connected-workspace-container" ? { remove: () => { removed = true; } } : null,
        createElement: () => { throw new Error("no element must be created"); }
    };
    appConfig.wsUrl = "";

    await initConnectedWorkspace(async () => {});

    assert.equal(removed, true);
    assert.equal(isApplyingRemoteState(), false);
});

test("every other export is a no-op while the connected workspace is disabled", () => {
    setLocation();
    globalThis.document = {
        querySelector: () => { throw new Error("the DOM must not be touched"); }
    };

    assert.doesNotThrow(() => {
        updateConnectedWorkspaceInviteUrl();
        applyWorkspaceSession("ABC123");
    });
});
