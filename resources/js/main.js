import { appState } from "./config.js";
import { loadViews } from "./views.js";
import { initializeNavigator } from "./navigator.js";
import { getWorks, getConcordances, getLinkTarget } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";

let WORK = "";
let WORK_ID = "";



export function loadLink(target, options = {}) {
    console.log("Load link requested:", target, options);
    getLinkTarget(target, appState.language, appState.editionUri).then((linkData) => {
        if (linkData.views) {
            loadViews(linkData);
        }
    }).catch((error) => {
        console.error("Error loading link target:", error);
    });
}


async function initializeApp() {
    const works = await getWorks(appState.editionUri);
    WORK = works[0]; //TODO: At the moment, all other works will be ignored
    WORK_ID = WORK.id;
    setWorkTitle(WORK);

    const concordances = await getConcordances(appState.editionUri, WORK_ID);
    document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));

    setupHeaderMenu();

    initializeNavigator(appState.editionUri, WORK_ID);

    registerLayoutListeners();

}

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});


