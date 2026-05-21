import { appConfig, appState } from "./config.js";

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

    el.setAttribute('ws-url', appConfig.wsUrl);

    el.addEventListener('received-message', (event) => {
        // TODO: handle incoming WebSocket messages within the Edirom Mobile app
        console.log('WebSocket message received:', event.detail);
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
