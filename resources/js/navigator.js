import { loadLink } from "./main.js";
import { switchPage } from "./pages.js";
import { getNavigatorConfig } from "./api.js";
import { appConfig, appState } from "./config.js";

export async function initializeNavigator(edition_uri, work_id) {
    let data = await getNavigatorConfig(edition_uri, work_id, "de", edition_uri);
    switchPage("navigator", buildNavigator(data));
}

function updateNavigatorData(data, navigatorElement = null) {
    if (!navigatorElement) {
        navigatorElement = document.querySelector("edirom-navigator");
    }
    navigatorElement.setAttribute("navigator-data", JSON.stringify(data));
}

export async function buildNavigator(navigatorData = null) {
    // Get Navigator Data if not provided
    if (!navigatorData) {
        // TODO: Entweder Navigator aus Konkordanz laden oder Navigator aus Navigatorconfig laden, je nachdem was bei Konkordanznavigator ausgewählt ist.
        navigatorData = await getNavigatorConfig(appState.editionUri, appState.workId, appState.language, appState.editionUri);
    }

    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.setAttribute("layout-mode", "mobile");
    updateNavigatorData(navigatorData, navigatorElement);
    navigatorElement.addEventListener("load-link-request", (event) => {
        loadLink(event.detail.target, event.detail.options);
    });
    return navigatorElement;
}