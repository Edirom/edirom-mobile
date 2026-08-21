const DEFAULT_LANGUAGE = "de";
const DEFAULT_AVAILABLE_VIEWS = [
    { "view": "annotationView", "label": "Annotationen", "icon": "list" },
    { "view": "sourceView", "label": "Faksimile", "icon": "image" },
    { "view": "textView", "label": "Text", "icon": "text_fields" }
];
const DEFAULT_VIEW_HEADER_ID = "view-header";

export const appConfig = {
    backendUrl: "",
    wsUrl: "",
    viewHeaderId: DEFAULT_VIEW_HEADER_ID,
    availableViews: [...DEFAULT_AVAILABLE_VIEWS]
};

/**
 * Fetches Frontend's config.json (the same file Desktop's ConfigController
 * reads) and populates `appConfig.backendUrl`/`appConfig.wsUrl`. Must be
 * awaited before anything that reads those two fields — see `initApp()` in
 * main.js. `backendUrl` is used exactly like Desktop uses it: the full base
 * URL (including path), with relative paths appended directly on top — see
 * api.js.
 * @returns {Promise<void>}
 */
export async function loadAppConfig() {
    try {
        const response = await fetch("../config.json");
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const config = await response.json();
        appConfig.backendUrl = config.backendURL ?? "";
        appConfig.wsUrl = config.wsURL ?? "";
    } catch (e) {
        console.warn("Failed to load ../config.json:", e);
    }
}

export const appState = {
    page: "",
    allEditions: [], // List of all editions from the configured backend
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
