import { VIEW_HEADER_ID, CURRENTLY_AVAILABLE_VIEWS } from "./constants.js";
import { swapContentContainerContent, loadLink } from "./main.js";
import { getNavigatorConfig } from "./api.js";

export async function initializeNavigator(backend_url, edition_uri, work_id) {
    let data = await getNavigatorConfig(edition_uri, work_id, "de", edition_uri);
    updateNavigatorData(data);
}

function updateNavigatorData(data) {
    const navigatorElement = document.querySelector("edirom-navigator");
    navigatorElement.setAttribute("navigator-data", JSON.stringify(data));
}

export function setupNavigator() {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.setAttribute("layout-mode", "mobile");
    navigatorElement.addEventListener("load-link-request", (event) => {
        loadLink(event.detail.target, event.detail.options);
    });
    swapContentContainerContent(navigatorElement);
}