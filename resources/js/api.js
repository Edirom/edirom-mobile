import { appConfig, appState } from "./config.js";

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
        console.error(`Failed to fetch JSON from ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Fetches HTML content from a URL and returns it as a string.
 * @param {string} url - The URL to fetch HTML from
 * @returns {Promise<string|null>} The HTML string, or null on error
 */
async function fetchHtml(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        console.error(`Failed to fetch HTML from ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Fetches plain text content from a URL and returns it as a string.
 * @param {string} url - The URL to fetch text from
 * @returns {Promise<string|null>} The text string, or null on error
 */
async function fetchText(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        console.error(`Failed to fetch text from ${url}: ${error.message}`);
        return null;
    }
}

export async function getPages(uri, edition, backendUrl = appState.edition.backendUrl) {
    const pagesData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getPages.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(appState.language)}`);
    return pagesData;
}

export async function getMovements(uri, edition, backendUrl = appState.edition.backendUrl) {
    const movementsData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getMovements.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(appState.language)}`);
    return movementsData;
}

export async function getMeasures(uri, edition, mdiv, backendUrl = appState.edition.backendUrl) {
    const measuresData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getMeasures.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&mdiv=${encodeURIComponent(mdiv)}&lang=${encodeURIComponent(appState.language)}`);
    return measuresData;
}

export async function getMeasurePage(id, edition, measure, measureCount = 1, backendUrl = appState.edition.backendUrl) {
    const measurePageData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getMeasurePage.xql?edition=${encodeURIComponent(edition)}&id=${encodeURIComponent(id)}&measure=${encodeURIComponent(measure)}&measureCount=${encodeURIComponent(measureCount)}&lang=${encodeURIComponent(appState.language)}`);
    return measurePageData;
}

export async function getMeasuresOnPage(uri, pageId, edition, backendUrl = appState.edition.backendUrl) {
    const data = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getMeasuresOnPage.xql?uri=${encodeURIComponent(uri)}&pageId=${encodeURIComponent(pageId)}&edition=${encodeURIComponent(edition)}&lang=${encodeURIComponent(appState.language)}`);
    return data;
}

/**
 * Fetches the rendered HTML text for a document URI within an edition.
 * @param {string} uri - The document URI to fetch text for
 * @param {string} edition - The edition URI
 * @param {string} [idPrefix] - The ID prefix applied to elements in the rendered HTML
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<string|null>} The rendered HTML string, or null on error
 */
export async function getText(uri, edition, idPrefix = "textView_", backendUrl = appState.edition.backendUrl) {
    const textData = await fetchHtml(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getText.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&idPrefix=${encodeURIComponent(idPrefix)}&lang=${encodeURIComponent(appState.language)}`);
    return textData;
}

/**
 * Fetches the annotations list for a given document URI within an edition.
 * @param {string} edition - The edition URI
 * @param {string} uri - The document URI to fetch annotations for
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The annotations data object, or null on error
 */
export async function getAnnotations(edition, uri, backendUrl = appState.edition.backendUrl) {
    const annotationsData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotations.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(appState.language)}`);
    return annotationsData;
}

/**
 * Fetches the full HTML text for a single annotation.
 * @param {string} edition - The edition URI
 * @param {string} uri - The annotation URI (document URI + "#" + annotation id)
 * @param {string} lang - The language code for the annotation text
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<string|null>} The annotation HTML text, or null on error
 */
export async function getAnnotationText(edition, uri, lang, backendUrl = appState.edition.backendUrl) {
    const annotationText = await fetchHtml(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationText.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationText;
}

/**
 * Fetches preview data for a single annotation.
 * @param {string} edition - The edition URI
 * @param {string} uri - The annotation URI (document URI + "#" + annotation id)
 * @param {string} lang - The language code
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The annotation previews data, or null on error
 */
export async function getAnnotationPreviews(edition, uri, lang, backendUrl = appState.edition.backendUrl) {
    const annotationPreviews = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationPreviews.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationPreviews;
}

/**
 * Fetches concordance data for a given work within an edition.
 * @param {string} editionUri - The edition URI
 * @param {string} workId - The work ID
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The concordance data, or null on error
 */
export async function getConcordances(editionUri, workId, backendUrl = appState.edition.backendUrl) {
    const concordanceData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getConcordances.xql?workId=${encodeURIComponent(workId)}&id=${encodeURIComponent(editionUri)}&edition=${encodeURIComponent(editionUri)}`);
    return concordanceData;
}

/**
 * Fetches metadata for a single edition by URI.
 * @param {string} editionUri - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The edition data object, or null on error
 */
export async function getEdition(editionUri, backendUrl = appState.edition.backendUrl) {
    const editionData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(editionUri)}`);
    return editionData;
}

/**
 * Resolves the URI for an edition by its ID.
 * @param {string} editionId - The edition ID
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<string|null>} The edition URI string, or null on error
 */
export async function getEditionUri(editionId, backendUrl = appState.edition.backendUrl) {
    const editionUriData = await fetchText(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEditionURI.xql?id=${encodeURIComponent(editionId)}`);
    return editionUriData;
}

/**
 * Fetches all editions available on a backend. Always returns an array,
 * even if the backend returns a single edition object.
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object[]|null>} An array of edition objects, or null on error
 */
export async function getEditions(backendUrl = appState.edition.backendUrl) {
    const editionsData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEditions.xql`);

    // if the data is only a single object, wrap in an array
    if (editionsData && !Array.isArray(editionsData)) {
        return [editionsData];
    }
    return editionsData;

}

/**
 * Fetches all editions from every configured backend URL in parallel and merges
 * them into a single list stored in `appState.allEditions`. Each edition object
 * is enriched with the `backendUrl` it was fetched from. Backends that fail
 * are silently skipped.
 * @returns {Promise<Object[]>} The merged list of all edition objects across all backends
 */
export async function getAllEditions() {
    const editionPromises = appConfig.backendUrls.map(async (url) => {
        try {
            const editions = await getEditions(url);
            return { backendUrl: url, data: editions };
        } catch (error) {
            console.warn(`Failed to fetch editions from ${url}:`, error);
            return { backendUrl: url, data: null };
        }
    });

    const editionResults = await Promise.all(editionPromises);
    const flattened = editionResults.flatMap(({ backendUrl, data }) => {
        if (!data) return [];
        const list = Array.isArray(data) ? data : [data];
        return list.map((edition) => ({ ...edition, backendUrl }));
    });

    appState.allEditions = flattened;
    console.log("Fetched all editions:", appState.allEditions);
    return appState.allEditions;
}

/**
 * Fetches all works belonging to a given edition document.
 * @param {string} editionDoc - The edition document identifier
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object[]|null>} An array of work objects, or null on error
 */
export async function getWorks(editionDoc, backendUrl = appState.edition.backendUrl) {
    const worksData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionDoc)}`);
    return worksData;
}


/**
 * Fetches the navigator configuration for a given edition and work.
 * @param {string} editionId - The edition ID
 * @param {string} workId - The work ID
 * @param {string} lang - The language code
 * @param {string} edition - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The navigator config object, or null on error
 */
export async function getNavigatorConfig(editionId, workId, lang, edition, backendUrl = appState.edition.backendUrl) {
    console.log("editionId", editionId);
    const navigatorConfig = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getNavigatorConfig.xql?editionId=${encodeURIComponent(editionId)}&workId=${encodeURIComponent(workId)}&lang=${encodeURIComponent(lang)}&edition=${encodeURIComponent(edition)}`);
    return navigatorConfig;
}

/**
 * Fetches metadata for a link target URI, including available views and title.
 * @param {string} uri - The target document URI
 * @param {string} lang - The language code
 * @param {string} edition - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the current edition's backend)
 * @returns {Promise<Object|null>} The link target data object, or null on error
 */
export function getLinkTarget(uri, lang, edition, backendUrl = appState.edition.backendUrl) {
    var url = new URL(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getLinkTarget.xql`);
    url.searchParams.append("uri", uri);
    url.searchParams.append("lang", lang);
    url.searchParams.append("edition", edition);
    url = url.toString();
    return fetchJSON(url);
}