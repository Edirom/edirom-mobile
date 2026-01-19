import { appState } from "./config.js";

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

export async function getAnnotations(edition, uri, backendUrl = appState.backendUrl) {
    const annotationsData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotations.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(appState.language)}`);
    return annotationsData;
}

export async function getAnnotationText(edition, uri, lang, backendUrl = appState.backendUrl) {
    const annotationText = await fetchHtml(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationText.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationText;
}

export async function getAnnotationPreviews(edition, uri, lang, backendUrl = appState.backendUrl) {
    const annotationPreviews = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getAnnotationPreviews.xql?edition=${encodeURIComponent(edition)}&uri=${encodeURIComponent(uri)}&lang=${encodeURIComponent(lang)}`);
    return annotationPreviews;
}

export async function getConcordances(editionId, workId, backendUrl = appState.backendUrl) {
    const concordanceData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getConcordances.xql?workId=${encodeURIComponent(workId)}&id=${encodeURIComponent(editionId)}&edition=${encodeURIComponent(editionId)}`);
    return concordanceData;
}

export async function getEdition(editionUri, backendUrl = appState.backendUrl) {
    const editionData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(editionUri)}`);
    return editionData;
}

export async function getEditionUri(editionId, backendUrl = appState.backendUrl) {
    const editionUriData = await fetchText(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEditionURI.xql?id=${encodeURIComponent(editionId)}`);
    return editionUriData;
}

export async function getEditions(backendUrl = appState.backendUrl) {
    const editionsData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getEditions.xql`);

    // if the data is only a single object, wrap in an array
    if (editionsData && !Array.isArray(editionsData)) {
        return [editionsData];
    }
    return editionsData;

}

export async function getWorks(editionId, backendUrl = appState.backendUrl) {
    const worksData = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionId)}`);
    return worksData;
}


export async function getNavigatorConfig(editionId, workId, lang, edition, backendUrl = appState.backendUrl) {
    console.log("editionId", editionId);
    const navigatorConfig = await fetchJSON(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getNavigatorConfig.xql?editionId=${encodeURIComponent(editionId)}&workId=${encodeURIComponent(workId)}&lang=${encodeURIComponent(lang)}&edition=${encodeURIComponent(edition)}`);
    return navigatorConfig;
}

export function getLinkTarget(uri, lang, edition, backendUrl = appState.backendUrl) {
    var url = new URL(`${backendUrl}/exist/apps/Edirom-Online-Backend/data/xql/getLinkTarget.xql`);
    url.searchParams.append("uri", uri);
    url.searchParams.append("lang", lang);
    url.searchParams.append("edition", edition);
    url = url.toString();
    return fetchJSON(url);
}