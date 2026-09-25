import { appConfig, appState } from "./config.js";

const SYNC_STATE_TYPE = "syncState";

const CONNECTOR_MODULE_URL = "../web-components/edirom-connected-workspace/edirom-connected-workspace.js";

let connectorElement = null;
let stateSyncHandler = null;
let lastSyncedKey = null;

// Set to true only once the connector component has actually been loaded and
// attached to the DOM (i.e. appConfig.wsUrl was present). While false, every
// exported function below is a no-op, so the whole connected workspace
// feature is completely inert when no ws-url is configured.
let connectedWorkspaceEnabled = false;

function getConnectorElement() {
    return connectorElement ?? (connectorElement = document.querySelector("edirom-connected-workspace"));
}

/**
 * Builds a canonical, order-independent key from a flat state object.
 * Used to detect and suppress echo loops.
 * @param {Object} state - Flat key-value state object
 * @returns {string} Sorted query-string representation
 */
function makeStateKey(state) {
    const params = new URLSearchParams(state);
    params.sort();
    return params.toString();
}

/**
 * Initializes the edirom-connected-workspace web component in the header.
 *
 * If `appConfig.wsUrl` is empty, the entire connected workspace is skipped:
 * the component module is never loaded and no `<edirom-connected-workspace>`
 * element is added to the DOM, so none of its functionality (connection,
 * session UI, vendor-library loading) is active. Every other exported function
 * in this module becomes a no-op in that case.
 *
 * Otherwise, the component module is loaded on demand, the element is created
 * with the configured `ws-url`, its event listeners are wired up, and it is
 * appended to `#edirom-connected-workspace-container` in the header.
 *
 * @returns {Promise<void>} Resolves once the connector is ready (or skipped).
 */
export async function initConnectedWorkspace() {
    if (!appConfig.wsUrl) {
        console.info('initConnectedWorkspace: appConfig.wsUrl is empty, connected workspace disabled.');
        return;
    }

    const container = document.querySelector('#edirom-connected-workspace-container');
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

    el.addEventListener('received-message', (event) => {
        const detail = event.detail;
        if (detail?.type === SYNC_STATE_TYPE && detail.payload) {
            lastSyncedKey = makeStateKey(detail.payload);
            if (stateSyncHandler) {
                stateSyncHandler(detail.payload);
            }
            return;
        }
    });

    el.addEventListener('session-joined', (event) => {
        if (event.detail?.hasLastRelayed) return;
        if (!event.detail?.isCreatingSession) return;
        lastSyncedKey = null;
        broadcastAppState();
    });

    container.appendChild(el);
    connectorElement = el;
    connectedWorkspaceEnabled = true;
}

/**
 * Builds and sets the invite-url attribute on the connected workspace element,
 * reflecting the current edition/work/connection context from appState.
 * The invite URL is the current app URL (origin + pathname) with edition, work,
 * and connection parameters set if available, followed by "workspaceSession="
 * (without a value). The connector appends its own session ID to complete the URL.
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

    const paramStr = params.toString();
    const separator = paramStr ? '&' : '?';
    const inviteUrl = base + (paramStr ? '?' + paramStr : '') + separator + 'workspaceSession=';

    el.setAttribute('invite-url', inviteUrl);
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
 * Registers the handler that receives the synced state from other session
 * clients. The handler is called with a flat key-value object.
 * @param {(state: Object) => void} handler - Called for each received state sync
 */
export function setStateSyncHandler(handler) {
    stateSyncHandler = typeof handler === "function" ? handler : null;
}

/**
 * Broadcasts the current app state (`edition`, `work`, `connection`) from the
 * central `appState` to the other clients in the session. Only truthy values
 * are included, so a client without a selected connection still syncs its
 * edition and work.
 */
export function broadcastAppState() {
    if (!connectedWorkspaceEnabled) return;
    const state = {};
    if (appState.edition?.id) state.edition = appState.edition.id;
    if (appState.work?.id) state.work = appState.work.id;
    if (appState.connection) state.connection = appState.connection;
    if (Object.keys(state).length === 0) return;
    broadcastStateSync(state);
}

/**
 * Sends a state object to the other session clients as a generic `syncState`
 * message. Any flat key-value object is allowed.
 * @param {Object} state - Flat key-value state object
 */
export function broadcastStateSync(state) {
    if (!connectedWorkspaceEnabled) return;
    const el = getConnectorElement();
    if (!el || !state) return;
    const key = makeStateKey(state);
    if (key === lastSyncedKey) return;
    lastSyncedKey = key;
    el.sendMessage(SYNC_STATE_TYPE, state);
}
