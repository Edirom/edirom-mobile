import { appConfig, appState } from "./config.js";
import { buildNavigator } from "./navigator.js";
import { getEditions, getAllEditions, getWorks } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage, buildEditionSelectionPage } from "./pages.js";
import { initConcordanceNavigator } from "./concordanceNavigator.js";


/**
 * Checks whether a given edition ID is available on a specific backend.
 * @param {string} editionId - The edition ID to look for
 * @param {string} backendUrl - The backend URL to query
 * @returns {Promise<boolean>} True if the edition was found on that backend
 */
async function isEditionAvailableInBackend(editionId, backendUrl) {
    let editions = await getEditions(backendUrl);
    let editionFound = editions.find((edition) => edition.id === editionId);
    return editionFound !== undefined;
}

/**
 * Searches all configured backends in parallel to find one that hosts the given edition.
 * @param {string} editionId - The edition ID to search for
 * @returns {Promise<string|null>} The URL of the first matching backend, or null if none found
 */
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

/**
 * Checks whether a given work ID is among the works loaded for the current edition.
 * @param {string} workId - The work ID to check
 * @returns {boolean} True if the work is available
 */
function isWorkAvailableInEdition(workId) {
    let workFound = appState.worksInEdition.find((work) => work.id === workId);
    return workFound !== undefined;
}






/**
 * Initializes the app for a given edition, resolving which backend hosts it if needed.
 *
 * If an `editionId` is provided, the function locates the appropriate backend (either
 * the supplied `backendUrl` or the first one found via `findBackendForEdition`). If no
 * `editionId` is given and only a single edition is available across all backends, that
 * edition is selected automatically. If the edition cannot be resolved, the edition
 * selection page is shown instead.
 *
 * @param {Object} [options]
 * @param {string|null} [options.editionId] - The edition ID to initialize
 * @param {string|null} [options.backendUrl] - A known backend URL for the edition
 * @param {string|null} [options.workId] - A specific work ID to initialize after the edition
 * @returns {Promise<void>}
 */
export async function initEdition({ editionId = null, backendUrl = null, workId = null } = {}) {
    let foundEditionId = "";
    appState.edition = {};

    if (editionId) {
        if (!backendUrl) {
            const foundUrl = await findBackendForEdition(editionId);
            if (foundUrl) {
                foundEditionId = editionId;
            }
        }
        else {
            if (await isEditionAvailableInBackend(editionId, backendUrl)) {
                foundEditionId = editionId;
            }
        }
    }
    else {
        if (!appState.allEditions || appState.allEditions.length === 0) {
            await getAllEditions();
        }
        if (appState.allEditions.length === 1) {
            foundEditionId = appState.allEditions[0].id;
        }
    }

    if (foundEditionId == "") {
        // Edition nicht gefunden, öffne Editionsauswahlseite.
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

    // find the foundEditionId in in all Editions to set it as the current edition
    let editionData = appState.allEditions.find((edition) => edition.id === foundEditionId);
    appState.edition = editionData;

    appState.worksInEdition = await getWorks(appState.edition.doc, appState.edition.backendUrl);

    initWork(workId);
}

/**
 * Initializes the app for a given work within the current edition.
 * If the requested work ID is not found, or no ID is given, the first available
 * work is used as a fallback. After resolving the work, updates the page title,
 * switches to the navigator page, and starts the concordance navigator.
 *
 * @param {string|null} [workId] - The work ID to initialize, or null to use the first available
 * @returns {Promise<void>}
 */
export async function initWork(workId = null) {
    console.log("Initializing work");
    let foundWorkId = "";
    appState.work = {};

    if (workId) {
        if (isWorkAvailableInEdition(workId)) {
            foundWorkId = workId;
        }
    }
    appState.work = appState.worksInEdition.find((work) => work.id === (foundWorkId));
    if (appState.work == null || appState.work == undefined) {
        if (appState.worksInEdition.length > 0) {
            appState.work = appState.worksInEdition[0];
        }
        else {
            console.error("No works found for edition", appState.edition.id);
            return;
        }
    }

    setWorkTitle();
    switchPage("navigator", buildNavigator());
    initConcordanceNavigator();


    console.log("Set work to", appState.work);
}


/**
 * Entry point for the app. Reads URL query parameters, sets up the header menu
 * and layout listeners, then initializes the edition and work.
 * @returns {Promise<void>}
 */
async function initApp() {
    console.log("Initializing Edirom Mobile App");
    const urlParams = new URLSearchParams(window.location.search);

    setupHeaderMenu();
    initEdition({
        editionId: urlParams.get("editionId"),
        backendUrl: urlParams.get("backendUrl"),
        workId: urlParams.get("workId")
    });
    registerLayoutListeners();

}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});


