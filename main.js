BACKEND_URL = "http://localhost:8080"; //TODO: This should not be hardcoded
EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; //TODO: This should not be hardcoded



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

async function getEdition() {
    const editionData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(EDITION_URI)}`);
    return editionData;
}

async function getWorks(editionId) {
    const worksData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionId)}`);
    return worksData;
}

function setWorkTitle(workData) {
    title = workData.title;
    document.getElementById("header-edition-name").textContent = title;
    document.title = title;

}

async function initializeApp() {
    const works = await getWorks(EDITION_URI);
    first_work = works[0]; //TODO: At the moment, all other works will be ignored
    setWorkTitle(first_work);
}

initializeApp();