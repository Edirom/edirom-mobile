import { appState } from "./config.js";
import { createViewWindow, updateCurrentView } from "./views.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { buildNavigatorDataFromParsedTargets, filterAndEnrichNavigatorData, setNavigatorData, buildNavigator } from "./navigator.js";
import { switchPage } from "./pages.js";

/**
 * Resolves a plist targets string and handles navigation based on the
 * `behaviour` config key. Supported behaviours:
 * - `"switchToNavigator"` – navigate to the navigator page.
 * - `"updateView"` – update the existing view window in-place.
 * - `"createViewWindow"` – always open a new view window.
 * - `"updateViewOrSwitchToNavigator"` – update in-place; fall back to navigator.
 * - `"updateViewOrCreateViewWindow"` – update in-place or open a new window.
 * - `"updateViewOrCreateViewWindowOrSwitchToNavigator"` – update, create, or
 *   fall back to the navigator.
 * If `setAsMainNavigation` or `addToCurrentNavigation` is set in the config,
 * the resolved targets are also pushed to the navigator data store.
 * @param {string} plist - A targets string as accepted by `parseTargets`
 * @param {Object} [additionalConfig={}] - Extra key-value pairs merged into the
 *   parsed config (existing plist keys take precedence)
 * @returns {Promise<void>}
 */
export async function loadLinks(plist, additionalConfig = {}) {
    console.log("Loading links from plist:", plist);
    let parsedTargets = parseTargets(plist, additionalConfig);

    if (parsedTargets.length === 0) {
        const configuredBehaviour = additionalConfig?.behaviour;
        const setAsMainNavigation = additionalConfig?.setAsMainNavigation || false;
        const addToCurrentNavigation = additionalConfig?.addToCurrentNavigation || false;

        if (setAsMainNavigation || addToCurrentNavigation) {
            setNavigatorData({ navigatorDefinition: [] }, setAsMainNavigation, addToCurrentNavigation);
        }

        const shouldSwitchToNavigator = [
            "switchToNavigator",
            "updateViewOrSwitchToNavigator",
            "updateViewOrCreateViewWindowOrSwitchToNavigator"
        ].includes(configuredBehaviour) && appState.page !== "navigator";

        if (shouldSwitchToNavigator) {
            switchPage("navigator", buildNavigator());
        }
        return;
    }

    let shouldSetNavigatorData = true;
    let shouldSwitchToNavigator = false;

    let setAsMainNavigation = parsedTargets[0]?.config?.setAsMainNavigation || false;
    let addToCurrentNavigation = parsedTargets[0]?.config?.addToCurrentNavigation || false;

    if (!setAsMainNavigation && !addToCurrentNavigation) {
        shouldSetNavigatorData = false;
    }

    const configuredBehaviour = parsedTargets[0]?.config?.behaviour;
    switch (configuredBehaviour) {
        case "switchToNavigator":
            if (appState.page !== "navigator")
                shouldSwitchToNavigator = true;
            break;
        case "updateView":
            loadLink(parsedTargets, true, false);
            break;
        case "createViewWindow":
            loadLink(parsedTargets, false, true);
            break;
        case "updateViewOrSwitchToNavigator":
            let success = loadLink(parsedTargets, true, false);
            if (!success) {
                shouldSwitchToNavigator = true;
            }
            break;
        case "updateViewOrCreateViewWindow":
            loadLink(parsedTargets, true, true);
            break;
        case "updateViewOrCreateViewWindowOrSwitchToNavigator":
            let success2 = loadLink(parsedTargets, true, true);
            if (!success2) {
                shouldSwitchToNavigator = true;
            }
            break;
        default:
            console.warn("Behaviour not specified or unrecognized, defaulting to updating the navigator.");

    }

    if (shouldSetNavigatorData) {
        let navigatorData = buildNavigatorDataFromParsedTargets(parsedTargets);
        let filteredAndEnrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
        setNavigatorData(filteredAndEnrichedNavigatorData, setAsMainNavigation, addToCurrentNavigation);
    }
    if (shouldSwitchToNavigator) {
        switchPage("navigator", buildNavigator());
    }


    // if (parsedTargets.length === 1) {
    //     loadLink(parsedTargets[0].target, parsedTargets[0].config);
    // }
    // else {
    //     let navigatorData = buildNavigatorDataFromParsedTargets(parsedTargets);
    //     let filteredAndEnrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
    //     setNavigatorData(filteredAndEnrichedNavigatorData);
    // }
}

/**
 * Attempts to navigate to the given target(s) by updating an existing view
 * window or opening a new one, depending on the flags. For a single target:
 * unknown URI types return false, external links open in a new tab and return
 * true, doc URIs open a new view window (if `createNewViewWindow` is true).
 * For multiple targets, iterates until a doc URI matching the current view's
 * document is found and updates it in-place (if `updateExistingViewWindow` is
 * true).
 * @param {Array<{target: string, config: Object}>} targets - Parsed target objects
 * @param {boolean} [updateExistingViewWindow=true] - Update the view window in-place if possible
 * @param {boolean} [createNewViewWindow=true] - Open a new view window if no in-place update was possible
 * @returns {boolean} `true` if a view action was taken, `false` otherwise
 */
export function loadLink(targets, updateExistingViewWindow = true, createNewViewWindow = true) {
    console.log("Load link:", targets, { updateExistingViewWindow, createNewViewWindow });

    if (!Array.isArray(targets) || targets.length === 0) {
        console.warn("Targets is not an Array or is empty.");
        return false;
    }

    if (targets.length === 1) {
        let target = targets[0].target;
        let config = targets[0].config || {};
        let uriType = getUriType(target);
        if (uriType === "unknown") {
            console.warn("Unknown URI type for target:", target);
            return false;
        }
        else if (uriType === "externalLink") {
            window.open(target, '_blank');
            return true;
        }
        else if (uriType === "doc") {
            // For single-target doc URIs, check whether an in-place update is possible before
            // falling through to createViewWindow. This mirrors the logic in the multi-target
            // loop below. We compare the clicked target against both the window's primary target
            // (appState.viewWindow.target) and its view-specific target
            // (appState.viewWindow.viewSpecificTarget) to handle sub-view scenarios where the
            // active view displays a different document than the one the window was opened with
            // (e.g. a textView showing text-5.xml inside a window opened for source.xml).
            if (updateExistingViewWindow && appState.page === "views") {
                const targetDoc = splitTargetIntoDocAndIds(target).doc;
                const windowDoc = splitTargetIntoDocAndIds(appState.viewWindow.target ?? '').doc;
                const viewSpecificDoc = splitTargetIntoDocAndIds(appState.viewWindow.viewSpecificTarget ?? '').doc;
                if (targetDoc === windowDoc || targetDoc === viewSpecificDoc) {
                    let viewContentDiv = document.querySelector("#view-content");
                    updateCurrentView(target, viewContentDiv, config);
                    return true;
                }
            }
            if (createNewViewWindow) {
                createViewWindow(target, config);
                return true;
            }
        }
    }

    for (let target of targets) {
        let config = target.config || {};
        let uriType = getUriType(target.target);
        if (uriType !== "doc") {
            continue;
        }
        else {
            if (updateExistingViewWindow) {
                if (appState.page === "views" && splitTargetIntoDocAndIds(appState.viewWindow.target).doc === splitTargetIntoDocAndIds(target.target).doc) {
                    let viewContentDiv = document.querySelector("#view-content");
                    updateCurrentView(target.target, viewContentDiv, config);
                    return true;
                }
            }
        }
    }
    return false;

    // let target, config;
    // if (!Array.isArray(targets) || targets.length !== 1) {
    //     return false;
    // }
    // else {
    //     target = targets[0].target;
    //     config = targets[0].config || {};
    // }

    // const uriType = getUriType(target);
    // if (uriType === "unknown") {
    //     console.warn("Unknown URI type for target:", target);
    //     return false;
    // }
    // else if (uriType === "externalLink") {
    //     window.open(target, '_blank');
    //     return true;
    // }
    // else if (uriType === "doc") {
    //     if (updateExistingViewWindow) {
    //         if (appState.page === "view" && splitTargetIntoDocAndIds(appState.viewWindow.target).doc === splitTargetIntoDocAndIds(target).doc) {
    //             let viewContentDiv = document.querySelector("#view-content");
    //             updateCurrentView(target, viewContentDiv, config);
    //             return true;
    //         }
    //     }
    //     if (createNewViewWindow) {
    //         createViewWindow(target, config); // legacy loadViews(target, config);
    //         return true;
    //     }
    //     return false;
    // }
}

/**
 * Determines the type of a URI string.
 * @param {string} uri - The URI to classify
 * @returns {"doc"|"externalLink"|"unknown"} `"doc"` for `xmldb:exist://...` URIs,
 *   `"externalLink"` for HTTP/WWW URLs, `"unknown"` otherwise
 */
export function getUriType(uri) {
    if (uri.startsWith("xmldb:exist")) {
        return "doc";
    }
    else if (uri.startsWith("http") || uri.startsWith("www")) {
        return "externalLink";
    }
    return "unknown";
}

/**
 * Inverse of parseTargets. Builds a target string with an optional config block in brackets.
 * Serializes the config object as key=value pairs joined by commas, appended to the target URI.
 * Keys in excludeKeys are omitted from the config block.
 * Keys with null or undefined values are also omitted.
 *
 * Value serialization mirrors the type inference in parseTargets:
 *   - boolean  → true / false  (unquoted)
 *   - number   → numeric string (unquoted)
 *   - Array    → [item1,item2,...] (recursive; string items are single-quoted)
 *   - string   → 'value' (always single-quoted for unambiguous round-trip)
 *
 * @param {string} target - The target URI.
 * @param {Object} config - The config object.
 * @param {string[]} excludeKeys - Keys to omit from the config block.
 * @returns {string} The target URI with the config block appended, e.g. "uri[key=value,key=value]".
 *
 * @example
 * buildTargetsStringWithConfig(
 *   'xmldb:exist:///db/apps/foo.xml#measure1',
 *   { width: 100, sort: 'sortHorizontally', name: 'test' },
 *   ['name']
 * )
 * // → "xmldb:exist:///db/apps/foo.xml#measure1[width=100,sort='sortHorizontally']"
 */
export function buildTargetsStringWithConfig(target, config, excludeKeys = []) {
    var serializeValue = function (v) {
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        if (Array.isArray(v)) return '[' + v.map(serializeValue).join(',') + ']';
        if (typeof v === 'string') return "'" + v + "'";
        return null; // skip any other type (object, null, undefined, etc.)
    };

    if (!config || typeof config !== 'object') return target;

    var pairs = [];
    for (var key in config) {
        if (!Object.prototype.hasOwnProperty.call(config, key)) continue;
        if (excludeKeys.indexOf(key) !== -1) continue;
        var val = config[key];
        if (val === null || val === undefined) continue;
        var serialized = serializeValue(val);
        if (serialized === null) continue;
        pairs.push(key + '=' + serialized);
    }

    return pairs.length === 0 ? target : target + '[' + pairs.join(',') + ']';
}


/**
 * Parses a targets string into an array of target/config objects.
 *
 * Spaces and semicolons in the input are masked internally with \uC280 so that
 * they act as URI separators. The targets string consists of one or more URIs
 * separated by whitespace or semicolons, with an optional single config block
 * in square brackets attached to any one of them. The config block applies
 * globally to all targets in the string. Config key-value pairs are separated
 * by commas; keys and values are separated by `=` or `:`.
 *
 * Value types are inferred automatically:
 * - Quoted values (`'...'` or `"..."`) → string (quotes stripped)
 * - `true` / `false`                   → boolean
 * - Numeric values (int or float)       → number
 * - `[item1, item2, ...]`               → array (items are also type-inferred)
 * - Anything else                       → string
 *
 * Only the first config block is used; any further `[...]` occurrences are
 * stripped from the target string.
 *
 * @param {string} targets - The raw targets attribute value, with URIs separated by whitespace or semicolons.
 * @param {Object} [additionalConfig={}] - Extra key-value pairs to merge into the parsed config. Keys already
 *   present in the plist config block take precedence; `additionalConfig` only fills in missing keys.
 * @returns {Array<{target: string, config: Object}>} Array of parsed target objects, each sharing the same config.
 *
 * @example
 * // Single URI, no config
 * parseTargets('xmldb:exist:///db/apps/foo.xml')
 * // → [{ target: 'xmldb:exist:///db/apps/foo.xml', config: {} }]
 *
 * @example
 * // Multiple URIs, config on second (shared by all)
 * parseTargets('foo.xml bar.xml[page=2, label=\'Intro\']')
 * // → [{ target: 'foo.xml', config: { page: 2, label: 'Intro' } },
 * //    { target: 'bar.xml', config: { page: 2, label: 'Intro' } }]
 *
 * @example
 * // Type inference: boolean, number, string, array
 * parseTargets('foo.xml[active=true, scale=1.25, mode=overview, ids=[a,b,c]]')
 * // → [{ target: 'foo.xml', config: { active: true, scale: 1.25, mode: 'overview', ids: ['a','b','c'] } }]
 *
 * @example
 * // Array of numbers, colon separator in config
 * parseTargets('foo.xml[counts:[1,2,3]]')
 * // → [{ target: 'foo.xml', config: { counts: [1, 2, 3] } }]
 */
export function parseTargets(targets, additionalConfig = {}) {
    if (!targets) return [];

    var sep = '\uC280';
    targets = targets.replace(/\s|;/g, sep); // Mask spaces and semicolons as URI separators

    // Splits a string on commas, but only at bracket depth 0 —
    // so commas inside array values like [a,b,c] are not treated as pair separators.
    var splitAtDepthZero = function (s) {
        var parts = [];
        var depth = 0, current = '';
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (ch === '[') { depth++; current += ch; }
            else if (ch === ']') { depth--; current += ch; }
            else if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
            else { current += ch; }
        }
        if (current) parts.push(current); // push last segment (no trailing comma)
        return parts;
    };

    // Infers the JS type of a single config value string.
    var parseValue = function (v) {
        if ((v.indexOf("'") === 0 && v.lastIndexOf("'") === v.length - 1) || (v.indexOf('"') === 0 && v.lastIndexOf('"') === v.length - 1))
            return v.slice(1, -1);                              // quoted → string, strip quotes
        if (v === 'true') return true;
        if (v === 'false') return false;
        if (v !== '' && !isNaN(v) && isFinite(v)) return Number(v); // v !== '' guards against isNaN('') === false
        if (v.indexOf('[') === 0 && v.lastIndexOf(']') === v.length - 1)
            return splitAtDepthZero(v.slice(1, -1)).map(function (item) { return parseValue(item.trim()); }); // recurse for arrays
        return v;                                               // fallback: plain string
    };

    // Walk the string character-by-character to find the first outermost [...]
    // (a simple regex can't handle nested brackets like [sort=[a,b,c]])
    var configStart = -1, depth = 0, configEnd = -1;
    for (var i = 0; i < targets.length; i++) {
        if (targets[i] === '[') {
            if (depth === 0) configStart = i; // record opening of outermost block
            depth++;
        } else if (targets[i] === ']') {
            depth--;
            if (depth === 0 && configStart !== -1) {
                configEnd = i; // found the matching close bracket
                break;
            }
        }
    }

    // Remove the config block from the URI string, split by sep, and filter empty strings.
    var stripped = configStart === -1
        ? targets
        : targets.slice(0, configStart) + targets.slice(configEnd + 1);
    var targetList = stripped.split(sep).map(function (t) { return t.trim(); }).filter(Boolean);

    var config = {};

    if (configStart !== -1) {

    var cfgString = targets.slice(configStart + 1, configEnd);
    var configPairs = splitAtDepthZero(cfgString).map(function (pair) {
        return pair.split(/[=:](.*)/).slice(0, 2);
    });

    for (var j = 0; j < configPairs.length; j++) {
        var k = configPairs[j][0];
        var v = configPairs[j][1];
        // Strip sep chars from keys and values to handle masked whitespace (e.g. \uC280sort → sort)
        var cleanK = sep ? k.split(sep).join('') : k;
        var cleanV = sep && v ? v.split(sep).join('') : v;
        if (cleanK && cleanK.trim()) {
            config[cleanK.trim()] = parseValue((cleanV && cleanV.trim()) || '');
        }
    }

    } // end if (configStart !== -1)

    // Merge additionalConfig: only fill in keys not already present in the plist config.
    for (var key in additionalConfig) {
        if (Object.prototype.hasOwnProperty.call(additionalConfig, key) &&
            !Object.prototype.hasOwnProperty.call(config, key)) {
            config[key] = additionalConfig[key];
        }
    }

    return targetList.map(function (t) { return { target: t, config: config }; });
}