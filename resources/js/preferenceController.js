import { SUPPORTED_LANGUAGES } from "./config.js";
import { getPreferences } from "./api.js";

/**
 * The preferences of the current edition, as loaded by `initPreferences`; `null` until then.
 * This is the counterpart of Edirom-Frontend's `PreferenceController` (an ExtJS controller that can't be reused
 * here), so the two decide the language the same way.
 * @type {Object<string, any>|null}
 */
let preferences = null;

/**
 * Reduces a language code to one of `SUPPORTED_LANGUAGES`: case-insensitive, and a regional code is reduced to
 * its language ("de-AT" and "de_AT" become "de"), like the backend does with the `Accept-Language` header.
 * Edirom-Frontend has no such check, so an unknown `?lang=` breaks its translations; here it is ignored.
 * @param {any} code - The language code to check
 * @returns {string|null} The supported language, or null if `code` is not a string naming one
 */
export function normalizeLanguage(code) {
    if (typeof code !== "string") return null;
    const language = code.trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

/**
 * Reads a parameter of the current URL's query string.
 * @param {string} name - The parameter name
 * @returns {string|null} The value, or null if the parameter is not there
 */
export function getURLParameter(name) {
    return new URLSearchParams(globalThis.location?.search ?? "").get(name);
}

/**
 * The language that the URL asks for with `?lang=`, if it is a supported one. Use it for links to other Edirom
 * apps (Desktop, invitations), which should only get a language that was asked for explicitly.
 * @returns {string|null} A language code from `SUPPORTED_LANGUAGES`, or null
 */
export function getExplicitLanguage() {
    return normalizeLanguage(getURLParameter("lang"));
}

/**
 * Loads the preferences of an edition from the backend: its default preferences with the preferences of the
 * edition's project on top. Without an edition, only the defaults are loaded. A failed request leaves no
 * preferences, so everything depending on them uses its fallback instead of failing.
 * @param {string} [editionUri] - The edition URI, or empty for the backend's default preferences
 * @returns {Promise<boolean>} Whether the preferences could be loaded
 */
export async function initPreferences(editionUri = "") {
    const loaded = await getPreferences(editionUri);
    preferences = loaded ?? {};
    return loaded !== null;
}

/**
 * Returns the value of a preference. `application_language` is decided like in Edirom-Frontend's
 * `getPreference`, in this order:
 *  1. the `lang` parameter of the URL,
 *  2. the edition's `application_language` preference (which the backend's default preferences set to "de"),
 *  3. "en".
 * It is evaluated on every call and nothing is stored, so the language follows the URL and the preferences.
 * @param {string} key - The preference key, e.g. "application_language"
 * @returns {any} The preference value, or undefined if there is none
 */
export function getPreference(key) {
    if (key === "application_language") {
        return getExplicitLanguage()
            ?? normalizeLanguage(preferences?.[key])
            ?? "en";
    }
    return preferences?.[key];
}
