import { loadLinks, getUriType } from "./linkController.js";
import { parseTargets, buildTargetsStringWithConfig } from "./targets.js";
import { buildConcordanceNavigatorData, splitUri } from "./concordanceNavigatorData.js";
import { getNavigatorConfig, getLinkTargets } from "./api.js";
import { appConfig, appState, setAppState } from "./config.js";
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
        const navigatorData = await fetchEnrichedNavigatorConfig();
        setAppState({ navigatorData: { ...appState.navigatorData, config: navigatorData } });
        setNavigatorData(navigatorData, setAsNavigatorDataMain, addToNavigatorDataCurrent);
        updateNavigatorData(navigatorData, navigatorElement);
        return navigatorData;
    } catch (error) {
        console.error("Failed to refresh navigator data:", error);
        throw error;
    } finally {
        hideContentLoading(loadingToken);
    }
}

/**
 * Fetches the navigator config of the current work from the backend and enriches it.
 * @returns {Promise<Object|null>} The enriched navigator data, or null if the request failed
 */
async function fetchEnrichedNavigatorConfig() {
    const navigatorData = await getNavigatorConfig(
        appState.edition.doc,
        appState.work.id,
        appState.language,
        appState.edition.doc
    );
    return enrichNavigatorData(navigatorData);
}

/**
 * Returns the edition's enriched navigator config of the current work. It is kept in
 * `appState.navigatorData.config` because the main navigator data gets replaced when a concordance
 * connection is shown. Fetches it if it has not been loaded yet (the first connection can be shown
 * before the first navigator refresh has finished).
 * @returns {Promise<Object>} The navigator data, or an empty one if the config is not available
 */
export async function ensureNavigatorConfig() {
    if (appState.navigatorData.config) return appState.navigatorData.config;

    const workId = appState.work.id;
    const navigatorData = await fetchEnrichedNavigatorConfig();
    if (navigatorData && appState.work.id === workId) {
        setAppState({ navigatorData: { ...appState.navigatorData, config: navigatorData } });
    }
    return navigatorData ?? EMPTY_NAVIGATOR_DATA;
}

const CONCORDANCE_LABELS = { additionalDocuments: "Weitere Dokumente", additionalResources: "Weitere Ressourcen" };

/**
 * Builds the navigator data for a concordance connection: its members are placed in the structure of the
 * edition's navigator config, the others are collected in "Weitere Dokumente" / "Weitere Ressourcen".
 * Names that neither the config nor the connection provides are fetched from the backend.
 * @param {string} plist - The plist of the connection
 * @returns {Promise<Object>} The enriched navigator data
 */
export async function buildConcordanceNavigatorDataFromPlist(plist) {
    const config = await ensureNavigatorConfig();
    return enrichNavigatorData(buildConcordanceNavigatorData(plist, config.navigatorDefinition, CONCORDANCE_LABELS));
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
        setAppState({
            navigatorData: {
                ...appState.navigatorData,
                main: data,
                current: [data]
            }
        });
    }
    else if (addToNavigatorDataCurrent) {
        setAppState({
            navigatorData: {
                ...appState.navigatorData,
                current: [...appState.navigatorData.current, data]
            }
        });
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
        setAppState({
            navigatorData: {
                ...appState.navigatorData,
                current: appState.navigatorData.current.slice(0, -1)
            }
        });
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
 * Enriches a navigator data object by filling in missing item names and collecting the
 * available view icons from the backend.
 *
 * For every item of type `"navigatorItem"` that has a non-empty `targets` value, the function:
 *   - Resolves a title for each target URI and sets `item.name` if it is currently
 *     missing or empty.
 *   - Collects icon strings for each target's available views and appends any new
 *     values to `item.icons` (duplicates are removed; existing entries are preserved).
 *
 * Title/icon resolution per target URI:
 *   - URIs of type `"doc"` (`xmldb:exist://...`): looked up in the backend. All documents of
 *     all items that lack a name or icons are resolved with a single `getLinkTargets` request.
 *     Items that already have both are not looked up. If the request fails, the target
 *     contributes no title and no icons.
 *   - URIs of type `"externalLink"`: title is the URI string itself; icon is `"open_in_new"`.
 *   - URIs of type `"selfLink"`: title is the URI string itself; icon is `"refresh"`.
 *
 * If a `targets` value resolves to more than one URI, the titles of all URIs are
 * joined with ` & ` (e.g. `"Title A & Title B"`).
 *
 * Afterwards, `item.targets` is rewritten using `buildTargetsStringWithConfig`
 * so that the stored targets string carries the correct `behaviour` config
 * (`"updateViewOrCreateViewWindowOrSwitchToNavigator"`). For multi-target items,
 * `addToCurrentNavigation: true` is also injected. The `behaviour`,
 * `setAsMainNavigation`, and `addToCurrentNavigation` keys from the original
 * plist config are replaced in this process.
 *
 * Categories without any item are removed.
 *
 * @param {Object|null} navigatorData - The navigator data object, e.g. `{ navigatorDefinition: [...] }`.
 *   Categories and items may be nested arbitrarily deep.
 * @returns {Promise<Object|null>} The same `navigatorData` object with `name`, `icons`,
 *   and `targets` fields enriched.
 */
export async function enrichNavigatorData(navigatorData) {
    if (!navigatorData?.navigatorDefinition) return navigatorData;

    const parsedTargetsByItem = new Map(collectNavigatorItems(navigatorData.navigatorDefinition)
        .map(item => [item, parseTargets(item.targets)])
        .filter(([, parsedTargets]) => parsedTargets.length > 0));
    const items = [...parsedTargetsByItem.keys()];
    const docInfos = await fetchDocInfos(items.filter(item => !item.name || !item.icons?.length)
        .flatMap(item => parsedTargetsByItem.get(item))
        .filter(({ target }) => getUriType(target) === "doc")
        .map(({ target }) => splitUri(target).doc));

    for (const item of items) {
        const parsedTargets = parsedTargetsByItem.get(item);
        const infos = parsedTargets.map(({ target }) => getTargetInfo(target, docInfos));

        if (!item.name) {
            item.name = infos.map(info => info.title).filter(Boolean).join(" & ");
        }
        item.icons = [...new Set([...(item.icons ?? []), ...infos.flatMap(info => info.icons)])];
        item.targets = buildItemTargets(parsedTargets);
    }

    navigatorData.navigatorDefinition = removeEmptyCategories(navigatorData.navigatorDefinition);
    return navigatorData;
}

/** All items with targets of a navigatorDefinition, at any depth. */
function collectNavigatorItems(nodes) {
    return nodes.flatMap(node => {
        if (node.type === "navigatorCategory") return collectNavigatorItems(node.items ?? []);
        return node.type === "navigatorItem" && node.targets ? [node] : [];
    });
}

/** Removes categories that have no items left, at any depth. */
function removeEmptyCategories(nodes) {
    return nodes.flatMap(node => {
        if (node.type !== "navigatorCategory") return [node];
        node.items = removeEmptyCategories(node.items ?? []);
        return node.items.length ? [node] : [];
    });
}

/**
 * Looks up the title and the icons of the views of documents with a single request.
 * @param {string[]} docs - Document URIs, duplicates are fine
 * @returns {Promise<Map<string, {title: string|null, icons: string[]}>>} Keyed by document URI
 */
async function fetchDocInfos(docs) {
    const uniqueDocs = [...new Set(docs)];
    const infos = new Map();
    if (uniqueDocs.length === 0) return infos;

    const linkTargets = await getLinkTargets(uniqueDocs, appState.language, appState.edition.doc);
    for (const linkTarget of linkTargets ?? []) {
        infos.set(linkTarget.uri, { title: linkTarget.title || null, icons: getViewIcons(linkTarget.views) });
    }
    return infos;
}

/** The icons of the views that the app can show. */
function getViewIcons(views) {
    return (views ?? [])
        .map(view => appConfig.availableViews.find(availableView => availableView.view === view.type)?.icon)
        .filter(Boolean);
}

/** Title and icons of one target URI. Documents that were not looked up yield neither. */
function getTargetInfo(target, docInfos) {
    const uriType = getUriType(target);
    if (uriType === "doc") return docInfos.get(splitUri(target).doc) ?? { title: null, icons: [] };
    return { title: target, icons: [uriType === "selfLink" ? "refresh" : "open_in_new"] };
}

/** The targets string of an item, carrying the `behaviour` that opens its target(s). */
function buildItemTargets(parsedTargets) {
    const config = { ...parsedTargets[0].config };
    delete config.behaviour;
    delete config.setAsMainNavigation;
    delete config.addToCurrentNavigation;
    config.behaviour = "updateViewOrCreateViewWindowOrSwitchToNavigator";
    if (parsedTargets.length > 1) {
        config.addToCurrentNavigation = true;
    }
    const targetUris = parsedTargets.map(({ target }) => target);
    return buildTargetsStringWithConfig(targetUris[0], config) +
        (targetUris.length > 1 ? " " + targetUris.slice(1).join(" ") : "");
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