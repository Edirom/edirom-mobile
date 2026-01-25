import { appConfig, appState } from "./config.js";
import { loadViews } from "./views.js";
import { buildNavigator, initializeNavigator } from "./navigator.js";
import { getEditions, getEdition, getAllEditions, getWorks, getConcordances, getLinkTarget, getNavigatorConfig } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage, buildEditionSelectionPage } from "./pages.js";

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

function isWorkAvailableInEdition(workId) {
    let workFound = appState.worksInEdition.find((work) => work.id === workId);
    return workFound !== undefined;
}






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

async function initConcordanceNavigator() {
    const concordances = await getConcordances(appState.edition.doc, appState.work.id, appState.edition.backendUrl);
    const footerElement = document.getElementById("footer");
    const concordanceNavigatorElement = document.createElement("edirom-concordance-navigator");
    concordanceNavigatorElement.setAttribute("layout-mode", "mobile");
    concordanceNavigatorElement.setAttribute("concordances-data", JSON.stringify(concordances));
    concordanceNavigatorElement.setAttribute("inject-disabled-concordance", "Freies Erkunden");
    concordanceNavigatorElement.addEventListener("show-connection-request", (event) => {
        loadLinks(event.detail.plist);
    });
    concordanceNavigatorElement.addEventListener("concordance-navigator-disabled", (event) => {
        onConcordanceNavigatorDisabled();
    });
    footerElement.innerHTML = ""; // Clear previous content
    footerElement.appendChild(concordanceNavigatorElement);
}

async function onConcordanceNavigatorDisabled() {
    console.log("Concordance navigator disabled");
    setNavigatorData(await getNavigatorConfig(appState.edition.doc, appState.work.id, appState.language, appState.edition.doc, appState.edition.backendUrl));

    // TODO: Break Views from restriction
}

function setNavigatorData(data) {
    appState.navigatorData = data;
    onNavigatorDataChanged();
}

function onNavigatorDataChanged() {
    if (appState.page === "navigator") {
        const navigatorElement = document.querySelector("edirom-navigator");
        if (navigatorElement) {
            navigatorElement.setAttribute("navigator-data", JSON.stringify(appState.navigatorData));
        }
    }
}

/**
 * Extracts parameters enclosed in brackets from the end of a URI.
 * Example: "http://example.com[key:value]" -> { cleanUri: "http://example.com", parameters: { key: "value" } }
 * @param {string} uri - The URI string to parse.
 * @returns {Object} An object containing the clean URI and the extracted parameters (or null).
 */
function extractUriParameters(uri) {
    let cleanUri = uri;
    let parameters = null;

    const paramMatch = cleanUri.match(/\[(.*?)\]$/);
    if (paramMatch) {
        const paramContent = paramMatch[1];
        const colonIndex = paramContent.indexOf(':');
        if (colonIndex !== -1) {
            const key = paramContent.substring(0, colonIndex);
            const value = decodeURIComponent(paramContent.substring(colonIndex + 1));
            parameters = { [key]: value };
        }
        cleanUri = cleanUri.substring(0, paramMatch.index);
    }
    return { cleanUri, parameters };
}

/**
 * Processes a list of URIs to extract document links.
 * Groups URIs by document path and parameters, collecting XML IDs.
 * @param {string[]} uris - Array of URI strings.
 * @returns {Object[]} Array of document objects with doc path, xmlIds, and parameters.
 */
function processDocUris(uris) {
    return uris.filter((entry) => entry.startsWith("xmldb:exist")).reduce((acc, uri) => {
        const { cleanUri, parameters } = extractUriParameters(uri);

        const [doc, xmlId] = cleanUri.split('#');
        const existing = acc.find(item => item.doc === doc && JSON.stringify(item.parameters) === JSON.stringify(parameters));

        if (existing) {
            if (xmlId) existing.xmlIds.push(xmlId);
        } else {
            const newItem = { doc: doc, xmlIds: xmlId ? [xmlId] : [], parameters: parameters };
            acc.push(newItem);
        }
        return acc;
    }, []);
}

/**
 * Processes a list of URIs to extract external links.
 * Extracts parameters and returns structured objects.
 * @param {string[]} uris - Array of URI strings.
 * @returns {Object[]} Array of external link objects with url and parameters.
 */
function processExternalLinkUris(uris) {
    return uris.filter((entry) => entry.startsWith("http") || entry.startsWith("www")).map(uri => {
        const { cleanUri, parameters } = extractUriParameters(uri);
        const obj = { url: cleanUri, parameters: parameters };
        return obj;
    });
}

async function loadLinks(plist) {
    var plistMasked = plist.replace(/\s|;/g, '\uC280'); // Replace spaces and semicolons with a private use character
    var uris = plistMasked.split('\uC280'); // Split by the private use character
    uris = uris.map(uri => uri.trim()).filter(uri => uri.length > 0);

    let urisData = {
        "docs": processDocUris(uris),
        "externalLinks": processExternalLinkUris(uris)
    };

    setNavigatorData(await buildNavigatorDataFromUrisData(urisData));
}

async function buildNavigatorDataFromUrisData(urisData) {
    console.log("Building navigator data from urisData", urisData);

    let navigatorDefinition = [];
    let categoryIndex = 0;

    if (urisData.docs && urisData.docs.length > 0) {
        const itemPromises = urisData.docs.map(async (doc, index) => {
            let name = "";
            let parameterName = null;

            if (doc.parameters && doc.parameters["name"]) {
                parameterName = doc.parameters["name"];
            }

            if (parameterName && parameterName !== "") {
                name = parameterName;
            } else {
                try {
                    let linkTarget = await getLinkTarget(doc.doc, appState.language, appState.editionUri);
                    if (linkTarget && linkTarget.title) {
                        name = linkTarget.title;
                    } else {
                        name = "Dokument";
                    }
                } catch (error) {
                    console.error("Failed to fetch link target title", error);
                    name = "Dokument";
                }
            }

            let target = doc.doc;
            if (doc.xmlIds && doc.xmlIds.length > 0) {
                target += "#" + doc.xmlIds.join("#");
            }
            if (doc.parameters) {
                for (const key in doc.parameters) {
                    if (key !== "name") {
                        target += `[${key}:${doc.parameters[key]}]`;
                    }
                }
            }

            return {
                type: "navigatorItem",
                id: `navItem-${categoryIndex}-${index + 1}`,
                sortNo: String(index + 1),
                name: name,
                targets: target,
                target: target
            };
        });

        const items = await Promise.all(itemPromises);

        navigatorDefinition.push({
            type: "navigatorCategory",
            id: `navCategory-${categoryIndex}`,
            sortNo: String(categoryIndex + 1),
            name: "Dokumente",
            items: items
        });
        categoryIndex++;
    }

    if (urisData.externalLinks && urisData.externalLinks.length > 0) {
        let items = [];
        let sortNoItem = 1;

        for (const link of urisData.externalLinks) {
            let name = "";
            let parameterName = null;

            if (link.parameters && link.parameters["name"]) {
                parameterName = link.parameters["name"];
            }

            if (parameterName && parameterName !== "") {
                name = parameterName;
            } else {
                name = link.url;
            }

            items.push({
                type: "navigatorItem",
                id: `navItem-${categoryIndex}-${sortNoItem}`,
                sortNo: String(sortNoItem),
                name: name,
                targets: link.url,
                target: link.url
            });
            sortNoItem++;
        }

        navigatorDefinition.push({
            type: "navigatorCategory",
            id: `navCategory-${categoryIndex}`,
            sortNo: String(categoryIndex + 1),
            name: "Externe Ressourcen",
            items: items
        });
    }

    return { navigatorDefinition: navigatorDefinition };
}

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
    initApp();
});


