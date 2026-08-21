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
    backendUrls: [],
    wsUrl: "",
    viewHeaderId: DEFAULT_VIEW_HEADER_ID,
    availableViews: [...DEFAULT_AVAILABLE_VIEWS]
};

/**
 * Fetches Frontend's config.json (the same file Desktop's ConfigController
 * reads) and populates `appConfig.backendUrls`/`appConfig.wsUrl`. Must be
 * awaited before anything that reads those two fields — see `initApp()` in
 * main.js.
 * @returns {Promise<void>}
 */
export async function loadAppConfig() {
    try {
        const response = await fetch("../config.json");
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const config = await response.json();
        appConfig.backendUrls = parseBackendUrls(config.backendURL ?? "");
        appConfig.wsUrl = config.wsURL ?? "";
    } catch (e) {
        console.warn("Failed to load ../config.json:", e);
    }
}

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

/**
 * Central setter for `appState`. Merges the given key-value pairs into
 * `appState` and logs every passed key with its new value.
 * @param {Object} updates - Key-value pairs to set on `appState`
 * @returns {Object} The updated `appState`
 */
export function setAppState(updates) {
    Object.assign(appState, updates);
    console.log("appState updated:", { ...updates });
    return appState;
}
