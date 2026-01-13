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

export async function getAnnotations(edition, uri) {
    const annotationsData = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotations.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(appState.language)}`);
    return annotationsData;
}

export async function getAnnotationText(edition, uri, lang) {
    const annotationText = await fetchHtml(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationText.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationText;
}

export async function getAnnotationPreviews(edition, uri, lang) {
    const annotationPreviews = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationPreviews.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationPreviews;
}

export async function getConcordances(editionId, workId) {
    const concordanceData = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getConcordances.xql?workId=${encodeURIComponent(workId)}&id=${encodeURIComponent(editionId)}&edition=${encodeURIComponent(editionId)}`);
    return concordanceData;
}

export async function getEdition(edition_uri) {
    const editionData = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(edition_uri)}`);
    return editionData;
}

export async function getWorks(editionId) {
    const worksData = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionId)}`);
    return worksData;
}


export async function getNavigatorConfig(editionId, workId, lang, edition) {
    console.log("editionId", editionId);
    const navigatorConfig = await fetchJSON(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getNavigatorConfig.xql?editionId=${encodeURIComponent(editionId)}&workId=${encodeURIComponent(workId)}&lang=${encodeURIComponent(lang)}&edition=${encodeURIComponent(edition)}`);
    return navigatorConfig;
}

export function getLinkTarget(uri, lang, edition) {
    var url = new URL(`${appConfig.backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getLinkTarget.xql`);
    url.searchParams.append("uri", uri);
    url.searchParams.append("lang", lang);
    url.searchParams.append("edition", edition);
    url = url.toString();
    return fetchJSON(url);
}