import { getConcordances, getNavigatorConfig } from "./api.js";
import { appState } from "./config.js";
import { loadLinks } from "./linkController.js";
import { filterAndEnrichNavigatorData, setNavigatorData } from "./navigator.js";
import { removeCurrentViewSubset } from "./views.js";

/**
 * Initializes the concordance navigator component in the page footer.
 * Fetches concordance data for the current work, creates the
 * `<edirom-concordance-navigator>` web component, and wires up event
 * listeners for connection requests and the disabled state.
 * @returns {Promise<void>}
 */
export async function initConcordanceNavigator() {
    const concordances = await getConcordances(appState.edition.doc, appState.work.id, appState.edition.backendUrl);
    const footerElement = document.getElementById("footer");
    const concordanceNavigatorElement = document.createElement("edirom-concordance-navigator");
    concordanceNavigatorElement.setAttribute("layout-mode", "mobile");
    concordanceNavigatorElement.setAttribute('enable-qr-code-scanner', 'true');
    concordanceNavigatorElement.setAttribute("concordances-data", JSON.stringify(concordances));
    concordanceNavigatorElement.setAttribute("inject-disabled-concordance", "Freies Erkunden");
    concordanceNavigatorElement.addEventListener("show-connection-request", (event) => {
        loadLinks(event.detail.plist, { "setAsMainNavigation": true, "behaviour": "updateViewOrSwitchToNavigator" });
    });
    concordanceNavigatorElement.addEventListener("concordance-navigator-disabled", (event) => {
        onConcordanceNavigatorDisabled();
    });
    footerElement.innerHTML = ""; // Clear previous content
    footerElement.appendChild(concordanceNavigatorElement);
}

/**
 * Handles the concordance navigator being switched to its disabled ("free exploration") state.
 * Fetches a fresh navigator config, enriches it, and pushes it to the navigator.
 * @returns {Promise<void>}
 */
async function onConcordanceNavigatorDisabled() {
    console.log("Concordance navigator disabled");
    removeCurrentViewSubset();
    let navigatorData = await getNavigatorConfig(appState.edition.doc, appState.work.id, appState.language, appState.edition.doc, appState.edition.backendUrl);
    let filteredAndEnrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
    setNavigatorData(filteredAndEnrichedNavigatorData, true, false);

    // TODO: Break Views from restriction
}