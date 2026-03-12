import { loadLinks, parseTargets, getUriType, buildTargetsStringWithConfig } from "./linkController.js";
import { getNavigatorConfig, getLinkTarget } from "./api.js";
import { appConfig, appState } from "./config.js";


/**
 * Serializes `data` as JSON and sets it as the `navigator-data` attribute on
 * the `<edirom-navigator>` element. If no element is provided, the first one
 * found in the document is used.
 * @param {Object} data - The navigator data to serialize
 * @param {HTMLElement|null} [navigatorElement] - The target element; queried from DOM if null
 */
function updateNavigatorData(data, navigatorElement = null) {
    if (!navigatorElement) {
        navigatorElement = document.querySelector("edirom-navigator");
    }
    navigatorElement.setAttribute("navigator-data", JSON.stringify(data));
}

/**
 * Creates and returns an `<edirom-navigator>` web component pre-populated with
 * the given navigator data and a listener for `load-links-request` events.
 * @param {Object} [navigatorData] - The navigator data to display; defaults to `appState.navigatorData`
 * @returns {Promise<HTMLElement>} The configured navigator element
 */
export async function buildNavigator(navigatorData = appState.navigatorData) {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.classList.add("web-component");
    navigatorElement.setAttribute("layout-mode", "mobile");
    navigatorElement.setAttribute("no-content-message", "(Noch) keine Inhalte für diesen Kontext verfügbar.");
    updateNavigatorData(navigatorData, navigatorElement);
    navigatorElement.addEventListener("load-links-request", (event) => {
        loadLinks(event.detail);
    });
    return navigatorElement;
}

/**
 * Updates the navigator data in `appState` and triggers a live update of the
 * navigator component if the navigator page is currently active.
 * @param {Object} data - The new navigator data
 */
export function setNavigatorData(data) {
    appState.navigatorData = data;
    onNavigatorDataChanged();
}

/**
 * Pushes the current `appState.navigatorData` to the `<edirom-navigator>` DOM
 * element if the navigator page is active. No-op otherwise.
 */
function onNavigatorDataChanged() {
    if (appState.page === "navigator") {
        const navigatorElement = document.querySelector("edirom-navigator");
        if (navigatorElement) {
            navigatorElement.setAttribute("navigator-data", JSON.stringify(appState.navigatorData));
        }
    }
}

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
export async function filterAndEnrichNavigatorData(navigatorData) {
    const VIEW_TYPE_ICONS = {
        textView: "text_fields",
        verovioView: "music_note_2",
        xmlView: "code_xml",
        sourceView: "image",
        videoView: "video_camera_back",
        annotationView: "list",
    };
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

/**
 * Converts an array of parsed target objects into a navigator data structure
 * by grouping them into `"docs"` and `"externalLinks"` categories.
 * @param {Array<{target: string, config: Object}>} parsedTargets - The parsed target objects
 * @returns {Object} A navigator data object with a `navigatorDefinition` array
 */
export function buildNavigatorDataFromParsedTargets(parsedTargets) {
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

/**
 * Builds a navigator data object with category/item structure from a grouped
 * URI data object. Creates one navigator category for each non-empty group
 * (`docs`, `externalLinks`) and one navigator item per URI entry.
 * @param {{docs?: Array, externalLinks?: Array}} urisData - Grouped URI entries
 * @returns {Object} A navigator data object with a `navigatorDefinition` array
 */
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