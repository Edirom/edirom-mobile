import { appState } from "./config.js";
import { loadViews } from "./views.js";
import { buildNavigatorDataFromParsedTargets, filterAndEnrichNavigatorData, setNavigatorData } from "./navigator.js";

/**
 * Resolves a plist targets string and handles the appropriate navigation.
 * If the string resolves to a single target, it is opened directly via `loadLink`.
 * If it resolves to multiple targets, a navigator data object is built, enriched,
 * and pushed to the navigator for display.
 * @param {string} plist - A targets string as accepted by `parseTargets`
 * @returns {Promise<void>}
 */
export async function loadLinks(plist) {
    console.log("Loading links from plist:", plist);
    let parsedTargets = parseTargets(plist)
    console.log("Parsed targets:", parsedTargets);

    if (parsedTargets.length === 1) {
        loadLink(parsedTargets[0].target, parsedTargets[0].config);
    }
    else {
        let navigatorData = buildNavigatorDataFromParsedTargets(parsedTargets);
        let enrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
        setNavigatorData(enrichedNavigatorData);
    }
}

/**
 * Fetches link target metadata for a URI and opens it in the appropriate view.
 * @param {string} target - The target URI to load
 * @param {Object} [config] - Additional options (currently passed through, not used)
 */
export function loadLink(target, config = {}) {
    console.log("Load link requested:", target, config);
    const uriType = getUriType(target);
    if (uriType === "unknown") {
        console.warn("Unknown URI type for target:", target);
        return;
    }
    else if (uriType === "externalLink") {
        window.open(target, '_blank');
        return;
    }
    else if (uriType === "doc") {
        loadViews(target, config);
    }
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
export function parseTargets(targets) {
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

    if (configStart === -1) return targetList.map(function (t) { return { target: t, config: {} }; });

    var cfgString = targets.slice(configStart + 1, configEnd);
    var configPairs = splitAtDepthZero(cfgString).map(function (pair) {
        return pair.split(/[=:](.*)/).slice(0, 2);
    });

    var config = {};
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

    return targetList.map(function (t) { return { target: t, config: config }; });
}