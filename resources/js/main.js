import { appState } from "./config.js";
import { loadViews } from "./views.js";
import { buildNavigator, initializeNavigator } from "./navigator.js";
import { getWorks, getConcordances, getLinkTarget } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage } from "./pages.js";

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
    appState.workId = WORK.id;
    setWorkTitle(WORK);

    const concordances = await getConcordances(appState.editionUri, appState.workId);
    document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));

    setupHeaderMenu();

    // Use replaceState for initial load to claim the browser's initial history entry
    // This ensures we don't lose a history slot to a null-state entry
    switchPage("navigator", await buildNavigator(), { replaceState: true });

    registerLayoutListeners();

}

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});


