import { appState } from "./config.js";
import { getLanguage } from "./languageController.js";
import { getWorkspaceSessionId } from "./connected-workspace.js";

/**
 * Builds the URL of Edirom-Frontend's Desktop UI for "Switch to desktop view", which carries over where the user
 * is: the edition, the work and the concordance connection (if one is shown), the language that is shown, and the
 * connected-workspace session (if the device is in one), and the document that is open (if one is). Desktop reads
 * the same parameter names.
 *
 * `connection` and `lang` are passed on even if the current URL never had them, because they can come from the
 * user's choices and the edition's preferences. Desktop accepts a connection only together with a work, which
 * Mobile always has once a connection is shown.
 *
 * The document is passed in as a link (`doc.xml#id`, see `getCurrentDocumentLink` in views.js), and not read here,
 * so that this module stays free of the views. Desktop opens it in the viewer that the id implies.
 * @param {Object} [options]
 * @param {string|null} [options.documentLink=null] - The document, with the xml:id of what is shown, to open on Desktop
 * @returns {string} The URL relative to this page (<frontend>/mobile/index.html), e.g. "../index.html?ui=desktop&edition=..."
 */
export function buildDesktopUrl({ documentLink = null } = {}) {
    const params = new URLSearchParams();
    params.set("ui", "desktop");
    if (appState.edition?.id) params.set("edition", appState.edition.id);
    if (appState.work?.id) params.set("work", appState.work.id);
    if (appState.connection) params.set("connection", appState.connection);
    params.set("lang", getLanguage());
    if (documentLink) params.set("uri", documentLink);
    // Stay in the Connected Workspace session. The workspace also remembers it per tab
    // (sessionStorage); the parameter covers a browser that blocks that.
    const session = getWorkspaceSessionId();
    if (session) params.set("session", session);

    return "../index.html?" + params.toString();
}
