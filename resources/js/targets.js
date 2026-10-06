/**
 * Pure helpers for target strings (a URI list with an optional `[key=value,...]` config block).
 * No browser dependencies, so they can also run in Node (see ../../tests).
 */

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
            // Restore the masked whitespace inside the config block. trim() removes it at the edges
            // (e.g. \uC280sort → sort) while it stays inside values (e.g. name='Foo Bar').
            var cleanK = k.split(sep).join(' ');
            var cleanV = v ? v.split(sep).join(' ') : v;
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