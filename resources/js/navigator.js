import { loadLink } from "./main.js";
import { switchPage } from "./pages.js";
import { getNavigatorConfig } from "./api.js";

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

export function buildNavigator(navigator_data) {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.setAttribute("layout-mode", "mobile");
    updateNavigatorData(navigator_data, navigatorElement);
    navigatorElement.addEventListener("load-link-request", (event) => {
        loadLink(event.detail.target, event.detail.options);
    });
    return navigatorElement;
}