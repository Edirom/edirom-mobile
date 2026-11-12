import { appState } from "./config.js";
import { getLanguage } from "./languageController.js";
import { getWorkspaceSessionId } from "./connected-workspace.js";

/**
 * Builds the URL of Edirom-Frontend's Desktop UI for "Switch to desktop view", which carries over where the user
 * is: the edition, the work and the concordance connection (if one is shown), the language that is shown, and the
 * connected-workspace session (if the device is in one). Desktop reads the same parameter names.
 *
 * `connection` and `lang` are passed on even if the current URL never had them, because they can come from the
 * user's choices and the edition's preferences. Desktop accepts a connection only together with a work, which
 * Mobile always has once a connection is shown.
 * @returns {string} The URL relative to this page (<frontend>/mobile/index.html), e.g. "../index.html?ui=desktop&edition=..."
 */
export function buildDesktopUrl() {
    const params = new URLSearchParams();
    params.set("ui", "desktop");
    if (appState.edition?.id) params.set("edition", appState.edition.id);
    if (appState.work?.id) params.set("work", appState.work.id);
    if (appState.connection) params.set("connection", appState.connection);
    params.set("lang", getLanguage());
    // Stay in the Connected Workspace session. The workspace also remembers it per tab
    // (sessionStorage); the parameter covers a browser that blocks that.
    const session = getWorkspaceSessionId();
    if (session) params.set("session", session);

    return "../index.html?" + params.toString();
}
