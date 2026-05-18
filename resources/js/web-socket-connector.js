import { appConfig } from "./config.js";

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
