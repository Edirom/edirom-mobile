import { appConfig, appState } from "./config.js";
import { loadViews } from "./views.js";
import { buildNavigator, initializeNavigator } from "./navigator.js";
import { getEditions, getEdition, getAllEditions, getWorks, getConcordances, getLinkTarget, getNavigatorConfig } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage, buildEditionSelectionPage } from "./pages.js";

let WORK = "";
let WORK_ID = "";



export function loadLink(target, options = {}) {
    console.log("Load link requested:", target, options);
    getLinkTarget(target, appState.language, appState.edition.doc).then((linkData) => {
        if (linkData.views) {
            loadViews(linkData);
        }
    }).catch((error) => {
        console.error("Error loading link target:", error);
    });
}

async function isEditionAvailableInBackend(editionId, backendUrl) {
    let editions = await getEditions(backendUrl);
    let editionFound = editions.find((edition) => edition.id === editionId);
    return editionFound !== undefined;
}

async function findBackendForEdition(editionId) {
    const availabilityChecks = appConfig.backendUrls.map(async url => {
        try {
            return { url, available: await isEditionAvailableInBackend(editionId, url) };
        } catch (error) {
            console.warn(`Failed to check edition availability at ${url}:`, error);
            return { url, available: false };
        }
    });

    const results = await Promise.all(availabilityChecks);
    const found = results.find(result => result.available);

    return found ? found.url : null;
}

function isWorkAvailableInEdition(workId) {
    let workFound = appState.worksInEdition.find((work) => work.id === workId);
    return workFound !== undefined;
}






export async function initEdition({ editionId = null, backendUrl = null, workId = null } = {}) {
    let foundEditionId = "";
    appState.edition = {};

    if (editionId) {
        if (!backendUrl) {
            const foundUrl = await findBackendForEdition(editionId);
            if (foundUrl) {
                foundEditionId = editionId;
            }
        }
        else {
            if (await isEditionAvailableInBackend(editionId, backendUrl)) {
                foundEditionId = editionId;
            }
        }
    }
    else {
        if (!appState.allEditions || appState.allEditions.length === 0) {
            await getAllEditions();
        }
        if (appState.allEditions.length === 1) {
            foundEditionId = appState.allEditions[0].id;
        }
    }

    if (foundEditionId == "") {
        // Edition nicht gefunden, öffne Editionsauswahlseite.
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

    // find the foundEditionId in in all Editions to set it as the current edition
    let editionData = appState.allEditions.find((edition) => edition.id === foundEditionId);
    appState.edition = editionData;

    appState.worksInEdition = await getWorks(appState.edition.doc, appState.edition.backendUrl);

    initWork(workId);
}

export async function initWork(workId = null) {
    console.log("Initializing work");
    let foundWorkId = "";
    appState.work = {};

    if (workId) {
        if (isWorkAvailableInEdition(workId)) {
            foundWorkId = workId;
        }
    }
    appState.work = appState.worksInEdition.find((work) => work.id === (foundWorkId));
    if (appState.work == null || appState.work == undefined) {
        if (appState.worksInEdition.length > 0) {
            appState.work = appState.worksInEdition[0];
        }
        else {
            console.error("No works found for edition", appState.edition.id);
            return;
        }
    }

    setWorkTitle();
    switchPage("navigator", buildNavigator());
    initConcordanceNavigator();


    console.log("Set work to", appState.work);
}

async function initConcordanceNavigator() {
    const concordances = await getConcordances(appState.edition.doc, appState.work.id, appState.edition.backendUrl);
    const footerElement = document.getElementById("footer");
    const concordanceNavigatorElement = document.createElement("edirom-concordance-navigator");
    concordanceNavigatorElement.setAttribute("layout-mode", "mobile");
    concordanceNavigatorElement.setAttribute("concordances-data", JSON.stringify(concordances));
    concordanceNavigatorElement.setAttribute("inject-disabled-concordance", "Freies Erkunden");
    concordanceNavigatorElement.addEventListener("show-connection-request", (event) => {
        loadLinks(event.detail.plist);
    });
    concordanceNavigatorElement.addEventListener("concordance-navigator-disabled", (event) => {
        onConcordanceNavigatorDisabled();
    });
    footerElement.innerHTML = ""; // Clear previous content
    footerElement.appendChild(concordanceNavigatorElement);
}

async function onConcordanceNavigatorDisabled() {
    console.log("Concordance navigator disabled");
    let navigatorData = await getNavigatorConfig(appState.edition.doc, appState.work.id, appState.language, appState.edition.doc, appState.edition.backendUrl);
    let enrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
    setNavigatorData(enrichedNavigatorData);

    // TODO: Break Views from restriction
}

function setNavigatorData(data) {
    appState.navigatorData = data;
    onNavigatorDataChanged();
}

function onNavigatorDataChanged() {
    if (appState.page === "navigator") {
        const navigatorElement = document.querySelector("edirom-navigator");
        if (navigatorElement) {
            navigatorElement.setAttribute("navigator-data", JSON.stringify(appState.navigatorData));
        }
    }
}

/**
 * Extracts parameters enclosed in brackets from the end of a URI.
 * Example: "http://example.com[key:value]" -> { cleanUri: "http://example.com", parameters: { key: "value" } }
 * @param {string} uri - The URI string to parse.
 * @returns {Object} An object containing the clean URI and the extracted parameters (or null).
 */
function extractUriParameters(uri) {
    let cleanUri = uri;
    let parameters = null;

    const paramMatch = cleanUri.match(/\[(.*?)\]$/);
    if (paramMatch) {
        const paramContent = paramMatch[1];
        const colonIndex = paramContent.indexOf(':');
        if (colonIndex !== -1) {
            const key = paramContent.substring(0, colonIndex);
            const value = decodeURIComponent(paramContent.substring(colonIndex + 1));
            parameters = { [key]: value };
        }
        cleanUri = cleanUri.substring(0, paramMatch.index);
    }
    return { cleanUri, parameters };
}

function getUriType(uri) {
    if (uri.startsWith("xmldb:exist")) {
        return "doc";
    }
    else if (uri.startsWith("http") || uri.startsWith("www")) {
        return "externalLink";
    }
    return "unknown";
}

/**
 * Processes a list of URIs to extract document links.
 * Groups URIs by document path and parameters, collecting XML IDs.
 * @param {string[]} uris - Array of URI strings.
 * @returns {Object[]} Array of document objects with doc path, xmlIds, and parameters.
 */
function processDocUris(uris) {
    return uris.filter((entry) => entry.startsWith("xmldb:exist")).reduce((acc, uri) => {
        const { cleanUri, parameters } = extractUriParameters(uri);

        const [doc, xmlId] = cleanUri.split('#');
        const existing = acc.find(item => item.doc === doc && JSON.stringify(item.parameters) === JSON.stringify(parameters));

        if (existing) {
            if (xmlId) existing.xmlIds.push(xmlId);
        } else {
            const newItem = { doc: doc, xmlIds: xmlId ? [xmlId] : [], parameters: parameters };
            acc.push(newItem);
        }
        return acc;
    }, []);
}

/**
 * Processes a list of URIs to extract external links.
 * Extracts parameters and returns structured objects.
 * @param {string[]} uris - Array of URI strings.
 * @returns {Object[]} Array of external link objects with url and parameters.
 */
function processExternalLinkUris(uris) {
    return uris.filter((entry) => entry.startsWith("http") || entry.startsWith("www")).map(uri => {
        const { cleanUri, parameters } = extractUriParameters(uri);
        const obj = { url: cleanUri, parameters: parameters };
        return obj;
    });
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
function buildTargetsStringWithConfig(target, config, excludeKeys = []) {
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
     * TODO: This function should be used centrally in the LinkController in the future
     *
     * Spaces and semicolons in the input are masked internally with \uC280 so that
     * they act as URI separators. The targets string consists of one or more URIs
     * separated by whitespace or semicolons, with an optional single config block
     * in square brackets attached to any one of them. The config block applies
     * globally to all targets in the string. Config key-value pairs are separated
     * by commas; keys and values are separated by `=` or `:`.
     *
     * Value types are inferred automatically:
     *   - Quoted values ('...' or "...") → string (quotes stripped)
     *   - `true` / `false`               → boolean
     *   - Numeric values (int or float)  → number
     *   - `[item1, item2, ...]`          → array (items are also type-inferred)
     *   - Anything else                  → string
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
function parseTargets(targets) {
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

const VIEW_TYPE_ICONS = {
    textView: "text_fields",
    verovioView: "music_note_2",
    xmlView: "code_xml",
    sourceView: "image",
    videoView: "video_camera_back",
    annotationView: "list",
};

/**
 * Enriches a navigator data object by resolving missing item names and collecting
 * available view icons from the backend.
 *
 * Recursively walks the full navigator data structure at any depth. For every node
 * of type `"navigatorItem"` that has a non-empty `targets` value, the function:
 *   - Resolves a title for each target URI and sets `item.name` if it is currently
 *     missing or empty.
 *   - Collects icon strings for each target's available views and appends any new
 *     values to `item.icons` (duplicates are removed; existing entries are preserved).
 *
 * Title/icon resolution per target URI:
 *   - URIs of type `"doc"` (`xmldb:exist://...`): fetched from the backend via a
 *     single `getLinkTarget` call that supplies both `title` and `views`.
 *     If the request fails, the target contributes `null` title and no icons.
 *   - URIs of type `"externalLink"`: title is the URI string itself; icon is `"open_in_new"`.
 *
 * All backend requests are fired in parallel via a single `Promise.all` call to
 * minimise total wait time.
 *
 * If a `targets` value resolves to more than one URI, the titles of all URIs are
 * joined with ` & ` (e.g. `"Title A & Title B"`).
 *
 * @param {Object} navigatorData - The navigator data object, e.g. `{ navigatorDefinition: [...] }`.
 *   Categories and items may be nested arbitrarily deep.
 * @returns {Promise<Object>} The same `navigatorData` object with `name` and `icons` fields enriched.
 */
async function filterAndEnrichNavigatorData(navigatorData) {
    const tasks = [];

    function collectItems(node) {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
            node.forEach(collectItems);
            return;
        }
        if (node.type === "navigatorItem" && node.targets) {
            const parsedTargets = parseTargets(node.targets);
            const promises = parsedTargets.map(pt =>
                getUriType(pt.target) === "doc"
                    ? getLinkTarget(pt.target, appState.language, appState.edition.doc)
                        .then(data => ({
                            title: data?.title || null,
                            icons: (data?.views || []).filter(v => appConfig.availableViews.includes(v.type)).map(v => VIEW_TYPE_ICONS[v.type]).filter(Boolean),
                        }))
                        .catch(() => ({ title: null, icons: [] }))
                    : Promise.resolve({ title: pt.target, icons: ["open_in_new"] })
            );
            tasks.push({ item: node, promises, parsedTargets });
        }
        Object.values(node).forEach(collectItems);
    }

    collectItems(navigatorData);

    if (tasks.length === 0) return navigatorData;

    const allPromises = tasks.flatMap(t => t.promises);
    const allResults = await Promise.all(allPromises);

    const itemsToRemove = new Set();
    let offset = 0;
    for (const { item, promises, parsedTargets } of tasks) {
        const results = allResults.slice(offset, offset + promises.length);

        const hasExternalLink = parsedTargets.some(pt => getUriType(pt.target) === "externalLink");
        const hasDocWithViews = results.some((r, i) => getUriType(parsedTargets[i].target) === "doc" && r.icons.length > 0);

        if (!hasExternalLink && !hasDocWithViews) {
            itemsToRemove.add(item);
        } else {
            if (!item.name) {
                const titles = results.map(r => r.title).filter(Boolean);
                item.name = titles.join(" & ");
            }

            const newIcons = results.flatMap(r => r.icons);
            item.icons = [...new Set([...(item.icons ?? []), ...newIcons])];
        }

        offset += promises.length;
    }

    function filterNode(node) {
        if (node.type === "navigatorItem") {
            return itemsToRemove.has(node) ? null : node;
        }
        if (node.type === "navigatorCategory") {
            node.items = node.items.map(filterNode).filter(Boolean);
            return node.items.length === 0 ? null : node;
        }
        return node;
    }

    if (navigatorData.navigatorDefinition) {
        navigatorData.navigatorDefinition = navigatorData.navigatorDefinition.map(filterNode).filter(Boolean);
    }

    return navigatorData;
}

function buildNavigatorDataFromParsedTargets(parsedTargets) {
    let urisData = {}
    for (const { target, config } of parsedTargets) {
        const type = getUriType(target);
        if (type === "doc") {
            if (!urisData.docs) urisData.docs = [];
            urisData.docs.push({ target: target, config: config });
        }
        else if (type === "externalLink") {
            if (!urisData.externalLinks) urisData.externalLinks = [];
            urisData.externalLinks.push({ target: target, config: config });
        }
    }
    return buildNavigatorDataFromUrisData(urisData);
}

function buildNavigatorDataFromUrisData(urisData) {
    console.log("Building navigator data from urisData", urisData);

    const categories = [
        { key: "docs", name: "Dokumente" },
        { key: "externalLinks", name: "Externe Ressourcen" }
    ];

    const navigatorDefinition = categories
        .filter(({ key }) => urisData[key]?.length > 0)
        .map(({ key, name }, categoryIndex) => ({
            type: "navigatorCategory",
            id: `navCategory-${categoryIndex}`,
            sortNo: String(categoryIndex + 1),
            name: name,
            items: urisData[key].map((entry, index) => ({
                type: "navigatorItem",
                id: `navItem-${categoryIndex}-${index + 1}`,
                sortNo: String(index + 1),
                name: entry.config?.["name"] ?? "",
                targets: buildTargetsStringWithConfig(entry.target, entry.config, ["name"])
            }))
        }));

    return { navigatorDefinition };
}

async function initApp() {
    console.log("Initializing Edirom Mobile App");
    const urlParams = new URLSearchParams(window.location.search);

    setupHeaderMenu();
    initEdition({
        editionId: urlParams.get("editionId"),
        backendUrl: urlParams.get("backendUrl"),
        workId: urlParams.get("workId")
    });
    registerLayoutListeners();



    // console.log("Initializing app with config:", appConfig);
    // const works = await getWorks(appState.editionUri);
    // WORK = works[0]; //TODO: At the moment, all other works will be ignored
    // appState.workId = WORK.id;
    // setWorkTitle(WORK);

    // const concordances = await getConcordances(appState.editionUri, appState.workId);
    // document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));

    // setupHeaderMenu();

    // // Use replaceState for initial load to claim the browser's initial history entry
    // // This ensures we don't lose a history slot to a null-state entry
    // switchPage("navigator", await buildNavigator(), { replaceState: true });

    // registerLayoutListeners();

}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});


