import { appConfig, appState, setAppState } from "./config.js";
import { getContentSignal } from "./loading.js";

/**
 * Fetches JSON data from a URL and returns it as a JavaScript object
 * @param {string} url - The URL to fetch JSON from
 * @param {RequestInit} [options] - Additional `fetch` options, e.g. `method` and `body`
 * @returns {Promise<any>} A promise that resolves to the parsed JSON object
 * @throws {Error} If the request fails or the response is not valid JSON
 */
async function fetchJSON(url, options = {}) {
    try {
        const response = await fetch(url, { signal: getContentSignal(), ...options });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') return null;
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
        const response = await fetch(url, { signal: getContentSignal() });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') return null;
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
        const response = await fetch(url, { signal: getContentSignal() });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') return null;
        console.error(`Failed to fetch text from ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Builds the URL of a backend XQuery endpoint. Like Edirom-Frontend's `doAJAXRequest`, which adds `lang` to every
 * request, this is the one place where the language is put on a request: `lang` is the current
 * `appState.language`, unless the caller passes one. Parameters that are `undefined` or `null` are left out.
 * @param {string} endpoint - The file name below `data/xql/`, e.g. `"getPages.xql"`
 * @param {Object<string, any>} [params] - The query parameters, in the order they should appear
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {string} The URL including the query string
 */
function buildUrl(endpoint, params = {}, backendUrl = appConfig.backendUrl) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) query.append(key, value);
    }
    if (!query.has("lang")) query.set("lang", appState.language);
    return `${backendUrl}data/xql/${endpoint}?${query}`;
}

export async function getPages(uri, edition, backendUrl = appConfig.backendUrl) {
    const pagesData = await fetchJSON(buildUrl("getPages.xql", { edition, uri }, backendUrl));
    return pagesData;
}

export async function getMovements(uri, edition, backendUrl = appConfig.backendUrl) {
    const movementsData = await fetchJSON(buildUrl("getMovements.xql", { edition, uri }, backendUrl));
    return movementsData;
}

export async function getMeasures(uri, edition, mdiv, backendUrl = appConfig.backendUrl) {
    const measuresData = await fetchJSON(buildUrl("getMeasures.xql", { edition, uri, mdiv }, backendUrl));
    return measuresData;
}

export async function getMeasurePage(id, edition, measure, measureCount = 1, backendUrl = appConfig.backendUrl) {
    const measurePageData = await fetchJSON(buildUrl("getMeasurePage.xql", { edition, id, measure, measureCount }, backendUrl));
    return measurePageData;
}

export async function getMeasuresOnPage(uri, pageId, edition, backendUrl = appConfig.backendUrl) {
    const data = await fetchJSON(buildUrl("getMeasuresOnPage.xql", { uri, pageId, edition }, backendUrl));
    return data;
}

/**
 * Fetches the rendered HTML text for a document URI within an edition.
 * @param {string} uri - The document URI to fetch text for
 * @param {string} edition - The edition URI
 * @param {string} [idPrefix] - The ID prefix applied to elements in the rendered HTML
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<string|null>} The rendered HTML string, or null on error
 */
export async function getText(uri, edition, idPrefix = "textView_", backendUrl = appConfig.backendUrl) {
    const textData = await fetchHtml(buildUrl("getText.xql", { edition, uri, idPrefix }, backendUrl));
    return textData;
}

/**
 * Fetches the annotations list for a given document URI within an edition.
 * @param {string} edition - The edition URI
 * @param {string} uri - The document URI to fetch annotations for
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The annotations data object, or null on error
 */
export async function getAnnotations(edition, uri, backendUrl = appConfig.backendUrl) {
    const annotationsData = await fetchJSON(buildUrl("getAnnotations.xql", { edition, uri }, backendUrl));
    return annotationsData;
}

/**
 * Fetches the full HTML text for a single annotation.
 * @param {string} edition - The edition URI
 * @param {string} uri - The annotation URI (document URI + "#" + annotation id)
 * @param {string} lang - The language code for the annotation text
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<string|null>} The annotation HTML text, or null on error
 */
export async function getAnnotationText(edition, uri, lang, backendUrl = appConfig.backendUrl) {
    const annotationText = await fetchHtml(buildUrl("getAnnotationText.xql", { edition, uri, lang }, backendUrl));
    return annotationText;
}

/**
 * Fetches preview data for a single annotation.
 * @param {string} edition - The edition URI
 * @param {string} uri - The annotation URI (document URI + "#" + annotation id)
 * @param {string} lang - The language code
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The annotation previews data, or null on error
 */
export async function getAnnotationPreviews(edition, uri, lang, backendUrl = appConfig.backendUrl) {
    const annotationPreviews = await fetchJSON(buildUrl("getAnnotationPreviews.xql", { edition, uri, lang }, backendUrl));
    return annotationPreviews;
}

/**
 * Fetches concordance data for a given work within an edition.
 * @param {string} editionUri - The edition URI
 * @param {string} workId - The work ID
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The concordance data, or null on error
 */
export async function getConcordances(editionUri, workId, backendUrl = appConfig.backendUrl) {
    const concordanceData = await fetchJSON(buildUrl("getConcordances.xql", { workId, id: editionUri, edition: editionUri }, backendUrl));
    return concordanceData;
}

/**
 * Fetches metadata for a single edition by URI.
 * @param {string} editionUri - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The edition data object, or null on error
 */
export async function getEdition(editionUri, backendUrl = appConfig.backendUrl) {
    const editionData = await fetchJSON(buildUrl("getEdition.xql", { id: editionUri }, backendUrl));
    return editionData;
}

/**
 * Resolves the URI for an edition by its ID.
 * @param {string} editionId - The edition ID
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<string|null>} The edition URI string, or null on error
 */
export async function getEditionUri(editionId, backendUrl = appConfig.backendUrl) {
    const editionUriData = await fetchText(buildUrl("getEditionURI.xql", { id: editionId }, backendUrl));
    return editionUriData;
}

/**
 * Fetches all editions available on a backend. Always returns an array,
 * even if the backend returns a single edition object.
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object[]|null>} An array of edition objects, or null on error
 */
export async function getEditions(backendUrl = appConfig.backendUrl) {
    const editionsData = await fetchJSON(buildUrl("getEditions.xql", {}, backendUrl));

    // if the data is only a single object, wrap in an array
    if (editionsData && !Array.isArray(editionsData)) {
        return [editionsData];
    }
    return editionsData;

}

/**
 * Fetches all editions from the configured backend and stores them in
 * `appState.allEditions`.
 * @returns {Promise<Object[]>} The list of all edition objects
 */
export async function getAllEditions() {
    const editions = await getEditions();
    setAppState({ allEditions: editions ?? [] });
    console.log("Fetched all editions:", appState.allEditions);
    return appState.allEditions;
}

/**
 * Fetches all works belonging to a given edition document.
 * @param {string} editionDoc - The edition document identifier
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object[]|null>} An array of work objects, or null on error
 */
export async function getWorks(editionDoc, backendUrl = appConfig.backendUrl) {
    const worksData = await fetchJSON(buildUrl("getWorks.xql", { editionId: editionDoc }, backendUrl));
    return worksData;
}


/**
 * Fetches the navigator configuration for a given edition and work.
 * @param {string} editionId - The edition ID
 * @param {string} workId - The work ID
 * @param {string} lang - The language code
 * @param {string} edition - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The navigator config object, or null on error
 */
export async function getNavigatorConfig(editionId, workId, lang, edition, backendUrl = appConfig.backendUrl) {
    console.log("editionId", editionId);
    const navigatorConfig = await fetchJSON(buildUrl("getNavigatorConfig.xql", { editionId, workId, lang, edition, mode: "json" }, backendUrl));
    return navigatorConfig;
}

/**
 * Fetches metadata for a link target URI, including available views and title.
 * @param {string} uri - The target document URI
 * @param {string} lang - The language code
 * @param {string} edition - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object|null>} The link target data object, or null on error
 */
export function getLinkTarget(uri, lang, edition, backendUrl = appConfig.backendUrl) {
    return fetchJSON(buildUrl("getLinkTarget.xql", { uri, lang, edition }, backendUrl));
}

/**
 * Fetches the metadata (title, available views, ...) of several link target URIs in one request.
 * Sent as POST, so the number of URIs is not limited by the URL length.
 * @param {string[]} uris - The target URIs
 * @param {string} lang - The language code
 * @param {string} edition - The edition URI
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object[]|null>} One `getLinkTarget` result (plus the requested `uri`) per URI, in request order; null on error
 */
export function getLinkTargets(uris, lang, edition, backendUrl = appConfig.backendUrl) {
    const body = new URLSearchParams();
    uris.forEach(uri => body.append("uri", uri));
    body.append("lang", lang ?? appState.language);
    body.append("edition", edition);
    // The parameters are in the body, so the URL is just the endpoint.
    return fetchJSON(`${backendUrl}data/xql/getLinkTargets.xql`, { method: "POST", body });
}

/**
 * Fetches the preferences of an edition (Edirom-Frontend's `initPreferences`): the backend's default preferences
 * with the preferences of the edition's project on top, as a flat key-value object. Without an edition, only the
 * defaults are returned.
 * @param {string} [editionUri] - The edition URI, or empty for the default preferences
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<Object<string, any>|null>} The preferences, or null on error
 */
export function getPreferences(editionUri = "", backendUrl = appConfig.backendUrl) {
    // Not tied to the content loading, which is aborted when the page changes: the language is needed regardless.
    return fetchJSON(buildUrl("getPreferences.xql", { mode: "json", edition: editionUri }, backendUrl), { signal: null });
}

/**
 * Fetches a language file (Edirom-Frontend's `initLangFile`): the backend's translations for the UI, with the
 * translations of the edition's project merged in.
 * @param {string} lang - The language code, e.g. "de" or "en"
 * @param {string} [editionUri] - The edition URI, or empty for the backend's own translations only
 * @param {string} [backendUrl] - The backend URL (defaults to the configured backend)
 * @returns {Promise<{lang: string, version: string, keys: Object<string, string>}|null>} The language file, or null on error
 */
export function getLanguageFile(lang, editionUri = "", backendUrl = appConfig.backendUrl) {
    return fetchJSON(buildUrl("getLanguageFile.xql", { lang, mode: "json", edition: editionUri }, backendUrl), { signal: null });
}
