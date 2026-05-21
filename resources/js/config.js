const DEFAULT_LANGUAGE = "de";
const DEFAULT_AVAILABLE_VIEWS = [
    { "view": "annotationView", "label": "Annotationen", "icon": "list" },
    { "view": "sourceView", "label": "Faksimile", "icon": "image" },
    { "view": "textView", "label": "Text", "icon": "text_fields" }
];
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
    wsUrl: window?.config?.APP_WS_URL ?? "",
    viewHeaderId: DEFAULT_VIEW_HEADER_ID,
    availableViews: [...DEFAULT_AVAILABLE_VIEWS]
};

export const appState = {
    page: "",
    allEditions: [], // List of all editions from all backends
    edition: {},
    worksInEdition: [],
    work: {},
    connection: null, // ID of the currently shown concordance connection, or null
    language: DEFAULT_LANGUAGE,
    navigatorData: {
        main: null,
        current: [] // history of navigator data states for "back" navigation
    },
    viewWindow: {
        view: null,
        target: null
    }
};
