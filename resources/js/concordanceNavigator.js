import { getConcordances } from "./api.js";
import { appState } from "./config.js";
import { loadLinks } from "./linkController.js";
import { refreshNavigatorDataFromBackend } from "./navigator.js";
import { removeCurrentViewSubset } from "./views.js";

function hasConnectionId(concordances, connectionId) {
    if (!Array.isArray(concordances) || !connectionId) return false;

    const normalizedId = String(connectionId);
    for (const concordance of concordances) {
        const directConnections = concordance?.connections?.connections;
        if (Array.isArray(directConnections) && directConnections.some((connection) => String(connection?.id) === normalizedId)) {
            return true;
        }

        const groups = concordance?.groups?.groups;
        if (!Array.isArray(groups)) continue;

        for (const group of groups) {
            const groupConnections = group?.connections?.connections;
            if (Array.isArray(groupConnections) && groupConnections.some((connection) => String(connection?.id) === normalizedId)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Initializes the concordance navigator component in the page footer.
 * Fetches concordance data for the current work, creates the
 * `<edirom-concordance-navigator>` web component, and wires up event
 * listeners for connection requests and the disabled state.
 * @param {string|null} [connectionId=null] - Optional connection ID to preselect
 * @returns {Promise<{initialConnectionResolved: boolean}>} Whether startup connection deep-link was resolved
 */
export async function initConcordanceNavigator(connectionId = null) {
    const concordances = await getConcordances(appState.edition.doc, appState.work.id, appState.edition.backendUrl);
    const footerElement = document.getElementById("footer");
    const concordanceNavigatorElement = document.createElement("edirom-concordance-navigator");
    const connectionExists = connectionId ? hasConnectionId(concordances, connectionId) : false;
    let initialConnectionResolved = !connectionId;
    let resolveInitialConnection = null;
    let initialConnectionPending = !!connectionId && connectionExists;

    const initialConnectionPromise = connectionId
        ? new Promise((resolve) => {
            resolveInitialConnection = (resolved) => {
                if (!initialConnectionPending) return;
                initialConnectionPending = false;
                initialConnectionResolved = !!resolved;
                resolve(initialConnectionResolved);
            };
        })
        : Promise.resolve(true);

    concordanceNavigatorElement.setAttribute("layout-mode", "mobile");
    concordanceNavigatorElement.setAttribute('enable-qr-code-scanner', 'true');
    concordanceNavigatorElement.setAttribute("concordances-data", JSON.stringify(concordances));
    concordanceNavigatorElement.setAttribute("inject-disabled-concordance", "Freies Erkunden");
    // Build a regex that matches only URLs sharing the current client's origin and pathname,
    // so the embedded QR scanner filters at scan time and only self-links fire qr-code-scanned.
    const escapedOrigin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPathname = window.location.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    concordanceNavigatorElement.setAttribute("qr-regex", `^${escapedOrigin}${escapedPathname}`);
    if (connectionExists) {
        concordanceNavigatorElement.setAttribute("current-connection", connectionId);
    }
    concordanceNavigatorElement.addEventListener("load-links-request", (event) => {
        loadLinks(event.detail, { behaviour: "updateViewOrSwitchToNavigator" });
    });
    concordanceNavigatorElement.addEventListener("show-connection-request", async (event) => {
        await loadLinks(event.detail.plist, { "setAsMainNavigation": true, "behaviour": "updateViewOrSwitchToNavigator" });
        concordanceNavigatorElement.closeScannerPopover();
        if (resolveInitialConnection) {
            resolveInitialConnection(true);
        }
    });
    concordanceNavigatorElement.addEventListener("concordance-navigator-disabled", () => {
        onConcordanceNavigatorDisabled().catch((error) => {
            console.error("Failed to refresh navigator after disabling concordance navigator:", error);
        });
    });
    footerElement.innerHTML = ""; // Clear previous content
    footerElement.appendChild(concordanceNavigatorElement);

    if (connectionExists) {
        await initialConnectionPromise;
    }

    return { initialConnectionResolved };
}

/**
 * Navigates the existing `<edirom-concordance-navigator>` element in the page footer
 * to a specific connection by ID without rebuilding the element.
 * Intended for the fast-path in `applyUrlParams` where only the connection changes.
 * @param {string} connectionId - The connection ID to navigate to
 * @returns {boolean} `true` if navigation succeeded, `false` if the element is not
 *   found or the connection ID is not present in the current concordance data
 */
export function navigateConcordanceNavigatorToConnection(connectionId) {
    const element = document.querySelector("#footer edirom-concordance-navigator");
    if (!element) return false;
    return element.navigateToConnectionById(connectionId);
}

/**
 * Handles the concordance navigator being switched to its disabled ("free exploration") state.
 * Fetches a fresh navigator config, enriches it, and pushes it to the navigator.
 * @returns {Promise<void>}
 */
async function onConcordanceNavigatorDisabled() {
    console.log("Concordance navigator disabled");
    removeCurrentViewSubset();
    await refreshNavigatorDataFromBackend({
        setAsNavigatorDataMain: true,
        addToNavigatorDataCurrent: false
    });

    // TODO: Break Views from restriction
}