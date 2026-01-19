const DEFAULT_EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; // TODO: This should not be hardcoded
const DEFAULT_LANGUAGE = "de";
const DEFAULT_AVAILABLE_VIEWS = ["annotationView"];
const DEFAULT_VIEW_HEADER_ID = "view-header";

/**
 * Parse semicolon-separated URLs into an array.
 * Handles both single URLs and multiple semicolon-separated URLs.
 * @param {string} urlString - Semicolon-separated URL string
 * @returns {string[]} Array of URLs
 */
const parseBackendUrls = (urlString) => {
    if (!urlString) return [];
    return urlString
        .split(";")
        .map(url => url.trim())
        .filter(url => url.length > 0);
};

export const appConfig = {
    backendUrls: parseBackendUrls(window?.config?.APP_BACKEND_URLS ?? ""),
    viewHeaderId: DEFAULT_VIEW_HEADER_ID,
    availableViews: [...DEFAULT_AVAILABLE_VIEWS]
};

export const appState = {
    page: "",
    backendUrl: "",
    editionId: "",
    editionUri: DEFAULT_EDITION_URI,
    allEditions: [],
    workId: "",
    language: DEFAULT_LANGUAGE,
};
