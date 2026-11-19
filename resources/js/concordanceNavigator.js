import { getConcordances } from "./api.js";
import { appState, setAppState } from "./config.js";
import { getLangString } from "./languageController.js";
import { getWebComponentFlag, getQrRegex } from "./preferenceController.js";
import { loadLinks } from "./linkController.js";
import { clearConcordanceFromNavigator } from "./navigator.js";
import { removeCurrentViewSubset } from "./views.js";
import { updateConnectedWorkspaceInviteUrl, notifyStateChanged, isApplyingRemoteState } from "./connected-workspace.js";
import { resolveScannedText } from "./shortLinkResolver.js";
import { isInternalTarget } from "./targets.js";
import { showContentLoading, hideContentLoading } from "./loading.js";

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
 * Opens what a QR code asks for. The navigator's scanner is the only source of this event. A short link is replaced
 * by the URL it stands for first (see shortLinkResolver.js); an external URL is then opened in this tab.
 * @param {CustomEvent<string>} event - `load-links-request`, with the scanned text as `detail`
 */
async function onLoadLinksRequest(event) {
    const navigatorElement = event.currentTarget;
    const loadingToken = showContentLoading();
    try {
        const text = await resolveScannedText(event.detail, window.location);
        await loadLinks(text, { behaviour: "updateViewOrSwitchToNavigator", sameTab: true });
    } finally {
        hideContentLoading(loadingToken);
        // The scanner popover must not stay open over what was opened
        navigatorElement.closeScannerPopover?.();
    }
}

/**
 * Initializes the concordance navigator component in the page footer.
 * Fetches concordance data for the current work, creates the
 * `<edirom-concordance-navigator>` web component, and wires up event
 * listeners for connection changes, QR scans, and the disabled state. The QR scanner is only enabled if the
 * edition's preferences set the `enable_qr_code_scanner` option of `edirom_concordance_navigator` to "true".
 * @param {string|null} [connectionId=null] - Optional connection ID to preselect
 * @returns {Promise<{initialConnectionResolved: boolean}>} Whether startup connection deep-link was resolved
 */
export async function initConcordanceNavigator(connectionId = null) {
    const concordances = await getConcordances(appState.edition.doc, appState.work.id);
    const footerElement = document.getElementById("footer");
    const concordanceWrapper = document.getElementById("concordance-navigator-wrapper") || footerElement;
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
    concordanceNavigatorElement.setAttribute("concordances-data", JSON.stringify(concordances));
    concordanceNavigatorElement.setAttribute("inject-disabled-concordance", getLangString("mobile.ConcordanceNavigator_freeExploration", "Free exploration"));
    // Arrow navigation skips connections with no targets; explicit selection (slider, text
    // input, deep-link) still lands on them.
    concordanceNavigatorElement.setAttribute("skip-empty-connections", "");
    // The QR scanner is opt-in: the edition's preferences have to enable it explicitly. The attribute is a
    // presence flag in the component (`enable-qr-code-scanner="false"` would enable it too), so it is only set when on.
    if (getWebComponentFlag("edirom_concordance_navigator", "enable_qr_code_scanner")) {
        concordanceNavigatorElement.setAttribute("enable-qr-code-scanner", "");
        // Which scanned codes are accepted is the edition's decision (`qr_regex`); without one every code is. The
        // components check the regex and disable the scanner, with a warning, if it is not a valid one.
        const qrRegex = getQrRegex();
        if (qrRegex !== null) {
            concordanceNavigatorElement.setAttribute("qr-regex", qrRegex);
        }
        // What opens inside the app (documents, links to Mobile itself such as the invite of a connected workspace
        // session) is accepted whatever the regex says: it limits what is fetched or opened elsewhere, not this.
        concordanceNavigatorElement.qrAlsoAccept = (text) => isInternalTarget(text, window.location);
    }
    if (connectionExists) {
        concordanceNavigatorElement.setAttribute("current-connection", connectionId);
    }
    concordanceNavigatorElement.addEventListener("load-links-request", onLoadLinksRequest);
    concordanceNavigatorElement.addEventListener("concordance-navigator-disabled", onConcordanceNavigatorDisabled);
    concordanceNavigatorElement.addEventListener("connection-changed", async (event) => {
        // Read before anything is awaited: it is only true while the workspace sync is applying its state
        const changedByUser = !isApplyingRemoteState();
        const connectionId = event.detail?.connectionId ?? null;
        setAppState({ connection: connectionId });
        updateConnectedWorkspaceInviteUrl();
        notifyStateChanged();

        // Shows the members of the connection in the navigator's concordance tab. The navigator switches to
        // that tab, unless the workspace sync changed the connection: it must not pull the user around.
        await loadLinks(event.detail.plist,
            { "setAsConcordanceNavigation": true, "behaviour": "updateViewOrSwitchToNavigator" },
            { selectConcordanceTab: changedByUser });
        concordanceNavigatorElement.closeScannerPopover();
        if (resolveInitialConnection) {
            resolveInitialConnection(true);
        }
    });
    concordanceWrapper.innerHTML = ""; // Clear previous concordance content
    concordanceWrapper.appendChild(concordanceNavigatorElement);

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
 * Switches the existing `<edirom-concordance-navigator>` in the page footer to its
 * injected "Freies Erkunden" (free exploration) entry, exactly as if the user had
 * picked it. This fires `concordance-navigator-disabled`, which
 * `onConcordanceNavigatorDisabled` handles.
 * @returns {boolean} `true` if the navigator is (now) in free exploration, `false`
 *   if the element is not found or has no free-exploration entry
 */
export function navigateConcordanceNavigatorToDisabled() {
    const element = document.querySelector("#footer edirom-concordance-navigator");
    const disabledName = element?.injectDisabledConcordanceName;
    if (!element || !disabledName) return false;
    if (element.isDisabledConcordanceSelected()) return true;
    if (element.concordanceSelector) {
        element.concordanceSelector.value = disabledName;
    }
    element.switchConcordance(disabledName, { expand: false });
    return true;
}

/**
 * Handles the concordance navigator being switched to its disabled ("free exploration") state.
 * Removes the navigator's concordance tab, so that only the edition's navigator config is left.
 */
function onConcordanceNavigatorDisabled() {
    removeCurrentViewSubset();
    setAppState({ connection: null });
    updateConnectedWorkspaceInviteUrl();
    notifyStateChanged();
    clearConcordanceFromNavigator();

    // TODO: Break Views from restriction
}