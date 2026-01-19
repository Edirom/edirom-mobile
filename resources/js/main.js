import { appConfig, appState } from "./config.js";
import { loadViews } from "./views.js";
import { buildNavigator, initializeNavigator } from "./navigator.js";
import { getEditions, getEdition, getWorks, getConcordances, getLinkTarget } from "./api.js";
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

async function isEditionAvailableInBackend(editionId, backendUrl) {
    let editions = await getEditions(backendUrl);
    let editionFound = editions.find((edition) => edition.id === editionId);
    return editionFound !== undefined;
}

async function findBackendForEdition(editionId) {
    const availabilityChecks = appConfig.backendUrls.map(async url => {
        try {
            return { url, available: await isEditionAvailableInBackend(editionId, url) };
        } catch (error) {
            console.warn(`Failed to check edition availability at ${url}:`, error);
            return { url, available: false };
        }
    });

    const results = await Promise.all(availabilityChecks);
    const found = results.find(result => result.available);

    return found ? found.url : null;
}




async function getAllEditions() {
    const editionPromises = appConfig.backendUrls.map(async (url) => {
        try {
            const editions = await getEditions(url);
            return { backendUrl: url, data: editions };
        } catch (error) {
            console.warn(`Failed to fetch editions from ${url}:`, error);
            return { backendUrl: url, data: null };
        }
    });

    appState.allEditions = await Promise.all(editionPromises);
}

async function initEdition({ editionId = null, backendUrl = null, workId = null } = {}) {
    appState.editionId = "";
    appState.backendUrl = "";

    if (editionId) {
        if (!backendUrl) {
            const foundUrl = await findBackendForEdition(editionId);
            if (foundUrl) {
                appState.editionId = editionId;
                appState.backendUrl = foundUrl;
            }
        }
        else {
            if (await isEditionAvailableInBackend(editionId, backendUrl)) {
                appState.editionId = editionId;
                appState.backendUrl = backendUrl;
            }
        }
    }
    else {
        if (!appState.allEditions) {
            await getAllEditions();
        }
        if (appState.allEditions.length === 1) {
            const singleEdition = appState.allEditions[0];
            appState.editionId = singleEdition.id;
            appState.backendUrl = singleEdition.backendUrl;
        }
    }

    if (appState.editionId == "" || appState.backendUrl == "") {
        // Edition nicht gefunden, öffne Editionsauswahlseite.
        if (!appState.allEditions) {
            await getAllEditions();
        }
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

    // initWork(work);
}

function initWork(work = null) {
    // initHeaderTitle();
    // initConcordanceNavigator();
    return;
}

async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    initEdition({
        editionId: urlParams.get("editionId"),
        backendUrl: urlParams.get("backendUrl"),
        workId: urlParams.get("workId")
    });



    // console.log("Initializing app with config:", appConfig);
    // const works = await getWorks(appState.editionUri);
    // WORK = works[0]; //TODO: At the moment, all other works will be ignored
    // appState.workId = WORK.id;
    // setWorkTitle(WORK);

    // const concordances = await getConcordances(appState.editionUri, appState.workId);
    // document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));

    // setupHeaderMenu();

    // // Use replaceState for initial load to claim the browser's initial history entry
    // // This ensures we don't lose a history slot to a null-state entry
    // switchPage("navigator", await buildNavigator(), { replaceState: true });

    // registerLayoutListeners();

}

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});


