const BACKEND_URL = window.config.APP_BACKEND_URL;
const EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; //TODO: This should not be hardcoded


/**
 * Fetches JSON data from a URL and returns it as a JavaScript object
 * @param {string} url - The URL to fetch JSON from
 * @returns {Promise<any>} A promise that resolves to the parsed JSON object
 * @throws {Error} If the request fails or the response is not valid JSON
 */
async function fetchJSON(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch JSON from ${url}: ${error.message}`);
    }
}

async function fetchHtml(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch HTML from ${url}: ${error.message}`);
    }
}

async function getConcordances(editionId, workId) {
    const concordanceData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getConcordances.xql?workId=${encodeURIComponent(workId)}&id=${encodeURIComponent(editionId)}&edition=${encodeURIComponent(editionId)}`);
    return concordanceData;
}

async function getEdition(edition_uri) {
    const editionData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(edition_uri)}`);
    return editionData;
}

async function getWorks(editionId) {
    const worksData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionId)}`);
    return worksData;
}

async function getNavigatorConfig(editionId, workId) {
    const navigatorConfigData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getNavigatorConfig2.xql?editionId=${encodeURIComponent(editionId)}&workId=${encodeURIComponent(workId)}`);
    return navigatorConfigData;
}

function setWorkTitle(workData) {
    title = workData.title;
    document.getElementById("header-edition-name").textContent = title;
    document.title = title;

}

function buildNavigator(navigatorConfig) {
    const navigatorElement = document.createElement("div");
    navigatorElement.id = "navigator-container";

    // Recursively build the navigator structure
    function buildNavigatorRecursive(items, level = 1) {
        const container = document.createElement("div");
        container.className = `navigator-level-${level}`;

        items.forEach(item => {
            if (item.type === "navigatorCategory") {
                // Create a wrapper div for the category
                const categoryDiv = document.createElement("div");
                categoryDiv.className = `navigator-category-level-${level}`;
                categoryDiv.id = item.id;

                // Create header element with level based on depth
                const headerLevel = Math.min(level, 6); // HTML only supports h1-h6
                const header = document.createElement(`h${headerLevel}`);
                header.textContent = item.name;
                categoryDiv.appendChild(header);

                // Recursively process nested items
                if (item.items && item.items.length > 0) {
                    const nestedContainer = buildNavigatorRecursive(item.items, level + 1);
                    categoryDiv.appendChild(nestedContainer);
                }

                container.appendChild(categoryDiv);
            } else if (item.type === "navigatorItem") {
                // Create button element for navigator items
                const button = document.createElement("button");
                button.textContent = item.name;
                button.id = item.id;
                button.setAttribute("ref", item.target);
                button.className = "navigator-item-button";

                // Optional: Add click handler if needed
                button.addEventListener("click", function () {
                    // Handle navigation to target
                    console.log("Navigate to:", item.target);
                });

                container.appendChild(button);
            }
        });

        return container;
    }

    // Build the navigator from the navigatorDefinition
    if (navigatorConfig.navigatorDefinition && navigatorConfig.navigatorDefinition.length > 0) {
        const navigatorContent = buildNavigatorRecursive(navigatorConfig.navigatorDefinition);
        navigatorElement.appendChild(navigatorContent);
    }

    document.getElementById("content-container").appendChild(navigatorElement);
}

async function initializeApp() {
    const works = await getWorks(EDITION_URI);
    first_work = works[0]; //TODO: At the moment, all other works will be ignored
    setWorkTitle(first_work);

    const concordances = await getConcordances(EDITION_URI, first_work.id);
    console.log(concordances);
    document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));



    // const navigatorConfig = await getNavigatorConfig(EDITION_URI, first_work.id);
    // buildNavigator(navigatorConfig);
}

initializeApp();