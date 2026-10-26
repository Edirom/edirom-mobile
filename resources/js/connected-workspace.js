import { appConfig, appState } from "./config.js";
import { getExplicitLanguage } from "./preferenceController.js";

// Resolved relative to this module (<frontend>/mobile/resources/js/), so three levels up is the
// Frontend root, where the component lives as a submodule in resources/js/.
const CONNECTOR_MODULE_URL = "../../../resources/js/edirom-connected-workspace/edirom-connected-workspace.js";

// The keys of `appState` that are part of the session state the ws-server
// keeps per client. The connector component owns the sync protocol; this
// module only tells it how to read and apply these keys.
const SYNCED_STATE_KEYS = ["edition", "work", "connection"];

let connectorElement = null;

// True while the app is being moved to a state the ws-server asked for. Everything that happens in the
// meantime (e.g. a `connection-changed` event of the concordance navigator) was not done by the user.
let applyingRemoteState = false;

// Set to true only once the connector component has actually been loaded and
// attached to the DOM (i.e. appConfig.wsUrl was present). While false, every
// exported function below is a no-op, so the whole connected workspace
// feature is completely inert when no ws-url is configured.
let connectedWorkspaceEnabled = false;

function getConnectorElement() {
    return connectorElement ?? (connectorElement = document.querySelector("edirom-connected-workspace"));
}

/**
 * Reads the synced part of the central `appState`. `null` means "not set";
 * for `connection` it is also the "Freies Erkunden" (free exploration) state.
 * @returns {{edition: string|null, work: string|null, connection: string|null}}
 */
export function getSyncedState() {
    return {
        edition: appState.edition?.id ?? null,
        work: appState.work?.id ?? null,
        connection: appState.connection ?? null
    };
}

/**
 * Whether the app is currently being moved to a state that the ws-server asked for (the workspace sync),
 * as opposed to a change that the user made. Read it synchronously where a change is noticed, e.g. in the
 * event handler of the concordance navigator: the changes that a sync causes all happen before it is done.
 * @returns {boolean}
 */
export function isApplyingRemoteState() {
    return applyingRemoteState;
}

/**
 * Initializes the edirom-connected-workspace web component in the header.
 *
 * If `appConfig.wsUrl` is empty, the entire connected workspace is skipped:
 * the component module is never loaded and no `<edirom-connected-workspace>`
 * element is added to the DOM, so none of its functionality (connection,
 * session UI, vendor-library loading) is active. The empty header container is
 * removed, and every other exported function in this module becomes a no-op.
 *
 * Otherwise, the component module is loaded on demand, the element is created
 * with the configured `ws-url`, the app's state handler is registered on it,
 * and it is appended to `#edirom-connected-workspace-container` in the header.
 *
 * @param {(patch: Object) => Promise<void>} applyState - Moves the app to the
 *   state in `patch` (a subset of edition/work/connection) after the server
 *   asked for it. Passed in by main.js, which owns the navigation logic.
 * @returns {Promise<void>} Resolves once the connector is ready (or skipped).
 */
export async function initConnectedWorkspace(applyState) {
    const container = document.querySelector('#edirom-connected-workspace-container');

    if (!appConfig.wsUrl) {
        console.info('initConnectedWorkspace: appConfig.wsUrl is empty, connected workspace disabled.');
        container?.remove();
        return;
    }

    if (!container) {
        console.warn('initConnectedWorkspace: #edirom-connected-workspace-container not found in DOM.');
        return;
    }

    try {
        await import(CONNECTOR_MODULE_URL);
    } catch (error) {
        console.error('initConnectedWorkspace: failed to load the connected workspace component.', error);
        return;
    }

    const el = document.createElement('edirom-connected-workspace');
    el.setAttribute('ws-url', appConfig.wsUrl);
    // The component defaults to English; Mobile's UI language is appState.language. It is kept up to date by
    // `setConnectedWorkspaceLanguage`, since the edition's preferences can change the language later.
    el.setAttribute('lang', appState.language);

    // The component applies one patch at a time per handler, so a flag (no counter) is enough.
    const applyRemoteState = async (patch) => {
        applyingRemoteState = true;
        try {
            await applyState(patch);
        } finally {
            applyingRemoteState = false;
        }
    };

    if (typeof el.registerStateHandler === 'function') {
        el.registerStateHandler({ keys: SYNCED_STATE_KEYS, get: getSyncedState, apply: applyRemoteState });
    } else {
        console.warn('initConnectedWorkspace: the connected workspace component has no state sync support (outdated version); sessions will not sync state.');
    }

    container.appendChild(el);
    connectorElement = el;
    connectedWorkspaceEnabled = true;
}

/**
 * Builds and sets the invite-url attribute on the connected workspace element,
 * reflecting the current edition/work/connection context from appState.
 * The invite URL is the current app URL (origin + pathname) with edition, work,
 * and connection parameters set if available (and `lang`, if the current URL
 * asked for a language), followed by "workspaceSession=" (without a value).
 * The connector appends its own session ID to complete the URL.
 */
export function updateConnectedWorkspaceInviteUrl() {
    if (!connectedWorkspaceEnabled) return;
    const el = document.querySelector('edirom-connected-workspace');
    if (!el) return;

    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();

    if (appState.edition?.id) params.set('edition', appState.edition.id);
    if (appState.work?.id) params.set('work', appState.work.id);
    if (appState.connection) params.set('connection', appState.connection);
    // Like Edirom-Frontend, only a language that the URL asked for is passed on; otherwise the invited client
    // decides on its own, from the same edition preference.
    const lang = getExplicitLanguage();
    if (lang) params.set('lang', lang);

    const paramStr = params.toString();
    const separator = paramStr ? '&' : '?';
    const inviteUrl = base + (paramStr ? '?' + paramStr : '') + separator + 'workspaceSession=';

    el.setAttribute('invite-url', inviteUrl);
}

/**
 * Sets the language of the connected workspace's texts. The component re-translates itself when its `lang`
 * attribute changes. Does nothing while the connected workspace is disabled.
 * @param {string} language - The language code, e.g. "de" or "en"
 */
export function setConnectedWorkspaceLanguage(language) {
    if (!connectedWorkspaceEnabled) return;
    getConnectorElement()?.setAttribute('lang', language);
}

/**
 * Instructs the connected workspace to join an existing session by ID.
 * If the element or session ID is not available, this is a no-op.
 * @param {string|null} sessionId - The session ID to join
 */
export function applyWorkspaceSession(sessionId) {
    if (!connectedWorkspaceEnabled) return;
    const el = document.querySelector('edirom-connected-workspace');
    if (!el || !sessionId) return;
    el.setAttribute('session', sessionId);
}

/**
 * Tells the connected workspace that the synced part of `appState` may have
 * changed. Call it at settled points (not while `appState` is mid-transition).
 * The component drops values the server already knows, so calling it
 * generously is harmless, and it never echoes a state that was just applied
 * from the server.
 */
export function notifyStateChanged() {
    if (!connectedWorkspaceEnabled) return;
    getConnectorElement()?.updateState?.(getSyncedState());
}
