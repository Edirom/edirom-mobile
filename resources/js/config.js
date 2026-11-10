/**
 * The languages Mobile can show: the backend has a `data/locale/edirom-lang-xx.xml` for each, and Edirom-Frontend
 * loads the same two (Application.js).
 */
export const SUPPORTED_LANGUAGES = ["de", "en"];
/**
 * The language until the preferences are loaded. Edirom-Frontend's `getLanguage()` also returns "en" before its
 * preferences are available.
 */
const DEFAULT_LANGUAGE = "en";
/**
 * `labelKey` is the backend language key of the label, `label` the fallback for a language file without it (the
 * English text of the key). The label is resolved when the views are listed, so that it follows the language.
 */
const DEFAULT_AVAILABLE_VIEWS = [
    { "view": "annotationView", "labelKey": "controller.window.Window_annotationView", "label": "Annotations", "icon": "list" },
    { "view": "sourceView", "labelKey": "controller.window.Window_sourceView", "label": "Facsimile", "icon": "image" },
    { "view": "textView", "labelKey": "controller.window.Window_textView", "label": "Text", "icon": "text_fields" }
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

/**
 * The state of the navigator, which shows tabs like the Navigator of Edirom-Frontend.
 * @returns {{config: Object|null, concordance: Object|null, activeTab: string, subNavigators: Object[]}}
 *   `config`: the edition's navigatorConfig for the current work, in the "main" tab.
 *   `concordance`: the members of the shown concordance connection, arranged like `config`, in the
 *   "concordance" tab; null in free exploration, when the tab does not exist.
 *   `activeTab`: the id of the tab that is shown.
 *   `subNavigators`: the lists opened from items with several targets, for "back" navigation. The
 *   last one is shown instead of the tabs.
 */
export function createNavigatorData() {
    return { config: null, concordance: null, activeTab: "main", subNavigators: [] };
}

export const appState = {
    page: "",
    allEditions: [], // List of all editions from the configured backend
    edition: {},
    worksInEdition: [],
    work: {},
    connection: null, // ID of the currently shown concordance connection, or null
    language: DEFAULT_LANGUAGE,
    navigatorData: createNavigatorData(),
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
