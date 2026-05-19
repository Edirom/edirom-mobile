import { loadLinks, parseTargets, getUriType, buildTargetsStringWithConfig } from "./linkController.js";
import { getNavigatorConfig, getLinkTarget } from "./api.js";
import { appConfig, appState } from "./config.js";
import { showContentLoading, hideContentLoading } from "./loading.js";

const EMPTY_NAVIGATOR_DATA = { navigatorDefinition: [] };


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
    if (!navigatorElement) {
        return;
    }
    navigatorElement.setAttribute("navigator-data", JSON.stringify(data ?? EMPTY_NAVIGATOR_DATA));
}

/**
 * Fetches navigator configuration from backend, enriches it and pushes the
 * result into app navigator state.
 * @param {Object} [options]
 * @param {boolean} [options.setAsNavigatorDataMain=true] - Store as main navigation root
 * @param {boolean} [options.addToNavigatorDataCurrent=false] - Push onto current stack
 * @param {HTMLElement|null} [options.navigatorElement=null] - Optional explicit target element
 * @returns {Promise<Object>} The loaded and enriched navigator data
 */
export async function refreshNavigatorDataFromBackend({
    setAsNavigatorDataMain = true,
    addToNavigatorDataCurrent = false,
    navigatorElement = null,
} = {}) {
    const loadingToken = showContentLoading();
    try {
        const navigatorData = await getNavigatorConfig(
            appState.edition.doc,
            appState.work.id,
            appState.language,
            appState.edition.doc,
            appState.edition.backendUrl
        );
        const filteredAndEnrichedNavigatorData = await filterAndEnrichNavigatorData(navigatorData);
        setNavigatorData(filteredAndEnrichedNavigatorData, setAsNavigatorDataMain, addToNavigatorDataCurrent);
        updateNavigatorData(filteredAndEnrichedNavigatorData, navigatorElement);
        return filteredAndEnrichedNavigatorData;
    } catch (error) {
        console.error("Failed to refresh navigator data:", error);
        throw error;
    } finally {
        hideContentLoading(loadingToken);
    }
}

/**
 * Creates and returns an `<edirom-navigator>` web component pre-populated with
 * the given navigator data and a listener for `load-links-request` events.
 * @param {Object} [navigatorData] - The navigator data to display. Defaults to
 *   the last entry in `appState.navigatorData.current`, or `appState.navigatorData.main`
 *   if the current history is empty.
 * @returns {Promise<HTMLElement>} The configured navigator element
 */
export async function buildNavigator(navigatorData = appState.navigatorData.current[appState.navigatorData.current.length - 1] || appState.navigatorData.main) {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.classList.add("web-component");
    navigatorElement.setAttribute("layout-mode", "mobile");
    navigatorElement.setAttribute("no-content-message", "(Noch) keine Inhalte für diesen Kontext verfügbar.");

    const hasExistingNavigatorData = navigatorData !== null && navigatorData !== undefined;
    updateNavigatorData(hasExistingNavigatorData ? navigatorData : EMPTY_NAVIGATOR_DATA, navigatorElement);

    if (!hasExistingNavigatorData) {
        refreshNavigatorDataFromBackend({
            setAsNavigatorDataMain: true,
            addToNavigatorDataCurrent: false,
            navigatorElement
        }).catch(() => {
            // On failure, loading is cleared in refreshNavigatorDataFromBackend.
        });
    }

    navigatorElement.addEventListener("load-links-request", (event) => {
        loadLinks(event.detail, { "behaviour": "updateViewOrSwitchToNavigator" });

    });
    return navigatorElement;
}

/**
 * Updates the navigator data in `appState` and triggers a live update of the
 * navigator component if the navigator page is currently active.
 * @param {Object} data - The new navigator data
 * @param {boolean} [setAsNavigatorDataMain=false] - If true, sets `data` as the
 *   main navigator data and resets the current navigation history to `[data]`.
 * @param {boolean} [addToNavigatorDataCurrent=false] - If true, appends `data`
 *   to the current navigation history stack (for "back" navigation).
 */
export function setNavigatorData(data, setAsNavigatorDataMain = false, addToNavigatorDataCurrent = false) {
    if (setAsNavigatorDataMain) {
        appState.navigatorData.main = data;
        appState.navigatorData.current = [data];
    }
    else if (addToNavigatorDataCurrent) {
        appState.navigatorData.current.push(data);
    }
    onNavigatorDataChanged();
}

/**
 * Pops the last entry from `appState.navigatorData.current` to navigate back
 * to the previous sub-navigator level. If the stack has more than one entry,
 * pops the top and updates the navigator DOM. If only one entry remains (the
 * main level), does nothing and returns `false`.
 * @returns {boolean} `true` if a level was popped, `false` if already at main level
 */
export function navigateBackInNavigator() {
    if (appState.navigatorData.current.length > 1) {
        appState.navigatorData.current.pop();
        onNavigatorDataChanged();
        return true;
    }
    return false;
}

/**
 * Pushes the most recent entry from `appState.navigatorData.current` (or
 * `appState.navigatorData.main` as a fallback) to the `<edirom-navigator>` DOM
 * element if the navigator page is active. No-op otherwise.
 */
function onNavigatorDataChanged() {
    if (appState.page === "navigator") {
        const navigatorElement = document.querySelector("edirom-navigator");
        if (navigatorElement) {
            updateNavigatorData(appState.navigatorData.current[appState.navigatorData.current.length - 1] || appState.navigatorData.main, navigatorElement);
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
 * After enrichment, `item.targets` is rewritten using `buildTargetsStringWithConfig`
 * so that the stored targets string carries the correct `behaviour` config
 * (`"updateViewOrCreateViewWindowOrSwitchToNavigator"`). For multi-target items,
 * `addToCurrentNavigation: true` is also injected. The `behaviour`,
 * `setAsMainNavigation`, and `addToCurrentNavigation` keys from the original
 * plist config are replaced in this process.
 *
 * @param {Object} navigatorData - The navigator data object, e.g. `{ navigatorDefinition: [...] }`.
 *   Categories and items may be nested arbitrarily deep.
 * @returns {Promise<Object>} The same `navigatorData` object with `name`, `icons`,
 *   and `targets` fields enriched.
 */
export async function filterAndEnrichNavigatorData(navigatorData) {
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
                            icons: (data?.views || []).filter(v => appConfig.availableViews.some(av => av.view === v.type)).map(v => appConfig.availableViews.find(av => av.view === v.type)?.icon).filter(Boolean),
                        }))
                        .catch(() => ({ title: null, icons: [] }))
                    : getUriType(pt.target) === "selfLink"
                        ? Promise.resolve({ title: pt.target, icons: ["refresh"] })
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
        const hasSelfLink = parsedTargets.some(pt => getUriType(pt.target) === "selfLink");
        const hasDocWithViews = results.some((r, i) => getUriType(parsedTargets[i].target) === "doc" && r.icons.length > 0);

        if (!hasExternalLink && !hasSelfLink && !hasDocWithViews) {
            itemsToRemove.add(item);
        } else {
            if (!item.name) {
                const titles = results.map(r => r.title).filter(Boolean);
                item.name = titles.join(" & ");
            }

            const newIcons = results.flatMap(r => r.icons);
            item.icons = [...new Set([...(item.icons ?? []), ...newIcons])];

            const newConfig = { ...parsedTargets[0].config };
            delete newConfig.behaviour;
            delete newConfig.setAsMainNavigation;
            delete newConfig.addToCurrentNavigation;
            newConfig.behaviour = "updateViewOrCreateViewWindowOrSwitchToNavigator";
            if (parsedTargets.length > 1) {
                newConfig.addToCurrentNavigation = true;
            }
            const targetUris = parsedTargets.map(pt => pt.target);
            item.targets = buildTargetsStringWithConfig(targetUris[0], newConfig) +
                (targetUris.length > 1 ? " " + targetUris.slice(1).join(" ") : "");
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