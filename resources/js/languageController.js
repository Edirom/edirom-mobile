import { SUPPORTED_LANGUAGES, appState, setAppState } from "./config.js";
import { getLanguageFile } from "./api.js";
import { getPreference, initPreferences } from "./preferenceController.js";

/**
 * The counterpart of Edirom-Frontend's `LanguageController` (an ExtJS controller that can't be reused here):
 * the translations of the backend's language files and the language that is shown. Both are loaded by
 * `applyLanguage`; which language is shown is decided by `getPreference('application_language')`.
 */

/** The translations of each supported language: language code -> {key -> string}. */
const langFiles = new Map();

/** Functions to call after the language was applied, see `onLanguageApplied`. */
const listeners = [];

/** The edition the preferences and language files were last loaded for; `null` if they never were. */
let appliedEditionUri = null;

/**
 * Loads the language file for one language into the cache. A failed request is logged by the API layer and
 * leaves the cached translations as they were, so the UI falls back to the strings of its callers.
 * @param {string} editionUri - The edition URI, or empty for the backend's own translations only
 * @param {string} lang - The language code, e.g. "de" or "en"
 * @returns {Promise<boolean>} Whether the language file could be loaded
 */
export async function initLangFile(editionUri, lang) {
    const file = await getLanguageFile(lang, editionUri);
    if (!file?.keys) return false;
    langFiles.set(lang, file.keys);
    return true;
}

/**
 * Loads the language files of all supported languages, like Edirom-Frontend does at startup: whichever language
 * ends up being shown, its strings are there.
 * @param {string} [editionUri] - The edition URI, or empty for the backend's own translations only
 * @returns {Promise<boolean>} Whether all language files could be loaded
 */
export async function initLangFiles(editionUri = "") {
    const results = await Promise.all(SUPPORTED_LANGUAGES.map((lang) => initLangFile(editionUri, lang)));
    return results.every(Boolean);
}

/**
 * The language that is shown: `?lang=` of the URL, else the edition's preference, else "en"
 * (see `getPreference`).
 * @returns {string} A language code from `SUPPORTED_LANGUAGES`
 */
export function getLanguage() {
    return getPreference("application_language");
}

/**
 * Returns the translation of a backend language key in the language that is shown, with `{0}`, `{1}`, ...
 * replaced by the extra arguments. Edirom-Frontend returns the key itself for a missing key; here the caller can
 * pass the string to use instead, which should be the English text of the key.
 * @param {string} key - The language key, e.g. "view.desktop.TaskBar_about"
 * @param {string} [fallback=key] - Returned when the key has no loaded translation
 * @param {...any} args - The values for the placeholders
 * @returns {string}
 */
export function getLangString(key, fallback = key, ...args) {
    const string = langFiles.get(getLanguage())?.[key] ?? fallback;
    return args.length ? string.replace(/\{(\d+)\}/g, (placeholder, index) => args[index] ?? placeholder) : string;
}

/**
 * Registers a function to call whenever `applyLanguage` is done, with the language that is shown. That is also
 * when the language stayed the same, because an edition's own language file can change strings. Use it to
 * re-render what was built from translations before.
 * @param {(language: string) => void} listener
 */
export function onLanguageApplied(listener) {
    listeners.push(listener);
}

/**
 * Loads the preferences and language files for an edition and makes the resulting language the app's:
 * `appState.language` (which `api.js` sends as `lang`) and the `lang` attribute of the page. Call it once at
 * startup without an edition, which only knows the backend's default preferences, and again as soon as an
 * edition is chosen, whose preferences may set another language. Does nothing if the edition's data is already
 * loaded.
 * @param {string} [editionUri] - The edition URI, or empty if no edition is chosen yet
 * @returns {Promise<string>} The language that is shown
 */
export async function applyLanguage(editionUri = "") {
    if (editionUri !== appliedEditionUri) {
        const [prefsLoaded, langFilesLoaded] = await Promise.all([initPreferences(editionUri), initLangFiles(editionUri)]);
        // A failed load is tried again the next time, instead of being remembered.
        appliedEditionUri = prefsLoaded && langFilesLoaded ? editionUri : null;
    }

    const language = getLanguage();
    setAppState({ language });
    if (typeof document !== "undefined") document.documentElement.lang = language;
    listeners.forEach((listener) => listener(language));
    return language;
}
