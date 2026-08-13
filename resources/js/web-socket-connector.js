import { appConfig, appState } from "./config.js";

const SYNC_STATE_TYPE = "syncState";

let connectorElement = null;
let stateSyncHandler = null;
let lastSyncedKey = null;

function getConnectorElement() {
    return connectorElement ?? (connectorElement = document.querySelector("edirom-web-socket-connector"));
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
 * Initializes the edirom-web-socket-connector web component in the header.
 * Reads the WebSocket URL from appConfig and sets it as the ws-url attribute
 * on the element, then wires up event listeners for messages received over
 * the WebSocket connection.
 */
export function initWebSocketConnector() {
    const el = document.querySelector('edirom-web-socket-connector');
    if (!el) {
        console.warn('initWebSocketConnector: <edirom-web-socket-connector> element not found in DOM.');
        return;
    }

    if (!appConfig.wsUrl) {
        console.warn('initWebSocketConnector: appConfig.wsUrl is empty, skipping WebSocket setup.');
        return;
    }

    connectorElement = el;
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
}

/**
 * Builds and sets the invite-url attribute on the WebSocket connector element,
 * reflecting the current edition/work/connection context from appState.
 * The invite URL is the current app URL (origin + pathname) with edition, work,
 * and connection parameters set if available, followed by "workspaceSession="
 * (without a value). The connector appends its own session ID to complete the URL.
 */
export function updateWebSocketConnectorInviteUrl() {
    const el = document.querySelector('edirom-web-socket-connector');
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
 * Instructs the WebSocket connector to join an existing session by ID.
 * If the element or session ID is not available, this is a no-op.
 * @param {string|null} sessionId - The session ID to join
 */
export function applyWorkspaceSession(sessionId) {
    const el = document.querySelector('edirom-web-socket-connector');
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
    const el = getConnectorElement();
    if (!el || !state) return;
    const key = makeStateKey(state);
    if (key === lastSyncedKey) return;
    lastSyncedKey = key;
    el.sendMessage(SYNC_STATE_TYPE, state);
}
