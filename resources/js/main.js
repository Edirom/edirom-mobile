import { loadViews } from "./views.js";
import { initializeNavigator, setupNavigator } from "./navigator.js";
import { getWorks, getConcordances, getLinkTarget } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";


document.BACKEND_URL = window.config.APP_BACKEND_URL;
document.VIEW_HEADER_ID = "view-header";
document.CURRENTLY_AVAILABLE_VIEWS = ["annotationView"];

document.EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; //TODO: This should not be hardcoded

document.LANGUAGE = "de";

let WORK = "";
let WORK_ID = "";



export function loadLink(target, options = {}) {
    console.log("Load link requested:", target, options);
    getLinkTarget(target, "de", document.EDITION_URI).then((linkData) => {
        if (linkData.views) {
            loadViews(linkData);
        }
    }).catch((error) => {
        console.error("Error loading link target:", error);
    });
}

export function swapContentContainerContent(newContent) {
    const contentContainer = document.getElementById("content-container");
    contentContainer.innerHTML = ""; // Clear previous content
    contentContainer.appendChild(newContent);
}

async function initializeApp() {
    const works = await getWorks(document.EDITION_URI);
    WORK = works[0]; //TODO: At the moment, all other works will be ignored
    WORK_ID = WORK.id;
    setWorkTitle(WORK);

    const concordances = await getConcordances(document.EDITION_URI, WORK_ID);
    document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));

    initializeNavigator(document.EDITION_URI, WORK_ID);

}

document.addEventListener("DOMContentLoaded", () => {
    setupHeaderMenu();
    setupNavigator();
});

initializeApp();
registerLayoutListeners();