import { loadLinks } from "./main.js";
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

export async function buildNavigator(navigatorData = appState.navigatorData) {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.classList.add("web-component");
    navigatorElement.setAttribute("layout-mode", "mobile");
    updateNavigatorData(navigatorData, navigatorElement);
    navigatorElement.addEventListener("load-links-request", (event) => {
        loadLinks(event.detail);
    });
    return navigatorElement;
}