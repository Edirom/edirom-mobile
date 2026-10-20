import { loadLinks, getUriType } from "./linkController.js";
import { parseTargets, buildTargetsStringWithConfig } from "./targets.js";
import { buildConcordanceNavigatorData, splitUri } from "./concordanceNavigatorData.js";
import { getNavigatorConfig, getLinkTargets } from "./api.js";
import { appConfig, appState, setAppState, createNavigatorData } from "./config.js";
import { showContentLoading, hideContentLoading } from "./loading.js";
import { getLangString } from "./about.js";

/**
 * The navigator has two tabs, like the Navigator of Edirom-Frontend: the edition's navigator config ("main",
 * always there) and the members of the shown concordance connection ("concordance", only while a connection
 * is shown). The state is kept in `appState.navigatorData` (see `createNavigatorData`) and pushed to the
 * `<edirom-navigator>` element by `renderNavigator`. Unlike in Edirom-Frontend, the navigator switches to the
 * "concordance" tab when the user changes the concordance data (but not when the workspace sync does).
 */
const MAIN_TAB = "main";
const CONCORDANCE_TAB = "concordance";

/** Identifies the latest request for concordance data, so that the results of superseded ones are dropped. */
let concordanceRequestId = 0;

/** Merges `updates` into `appState.navigatorData`. */
function updateNavigatorState(updates) {
    setAppState({ navigatorData: { ...appState.navigatorData, ...updates } });
}

/**
 * Empties the navigator state, for a new work. Concordance data that is still being built is discarded.
 */
export function resetNavigatorData() {
    concordanceRequestId++;
    setAppState({ navigatorData: createNavigatorData() });
}

/**
 * The tabs of the navigator for the current state, as `navigator-data` of `<edirom-navigator>` expects them.
 * @returns {Array<{id: string, name: string, navigatorDefinition: Array}>}
 */
function getNavigatorTabs() {
    const { config, concordance } = appState.navigatorData;
    const tabs = [{
        id: MAIN_TAB,
        name: getLangString("controller.navigator.Navigator_NavigationTab", "Navigation"),
        navigatorDefinition: config?.navigatorDefinition ?? []
    }];
    if (concordance) {
        tabs.push({
            id: CONCORDANCE_TAB,
            name: getLangString("controller.navigator.Navigator_ConcordanceTab", "Konkordanz"),
            navigatorDefinition: concordance.navigatorDefinition ?? []
        });
    }
    return tabs;
}

/**
 * Pushes the navigator state to an `<edirom-navigator>` element: the tabs and the active tab, or the last
 * sub-navigator (without tabs) while there is one.
 * @param {HTMLElement|null} [navigatorElement] - The target element; the one in the content container if omitted.
 *   Does nothing if there is none, i.e. if the navigator page is not shown.
 */
function renderNavigator(navigatorElement = document.querySelector("#content-container edirom-navigator")) {
    if (!navigatorElement) return;

    const { subNavigators, activeTab } = appState.navigatorData;
    if (subNavigators.length > 0) {
        navigatorElement.setAttribute("navigator-data", JSON.stringify(subNavigators[subNavigators.length - 1]));
        return;
    }

    const tabs = getNavigatorTabs();
    navigatorElement.setAttribute("navigator-data", JSON.stringify(tabs));
    navigatorElement.setAttribute("active-tab", tabs.some(tab => tab.id === activeTab) ? activeTab : MAIN_TAB);
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
 * Fetches the enriched navigator config of the current work and stores it in the navigator state,
 * unless the work has changed in the meantime.
 * @returns {Promise<Object|null>} The enriched navigator data, or null if the request failed
 */
async function loadNavigatorConfig() {
    const workId = appState.work.id;
    const navigatorData = await fetchEnrichedNavigatorConfig();
    if (navigatorData && appState.work.id === workId) {
        updateNavigatorState({ config: navigatorData });
    }
    return navigatorData;
}

/**
 * Loads the navigator config of the current work from the backend into the "main" tab.
 * @returns {Promise<Object|null>} The loaded and enriched navigator data
 */
export async function refreshNavigatorDataFromBackend() {
    const loadingToken = showContentLoading();
    try {
        const navigatorData = await loadNavigatorConfig();
        renderNavigator();
        return navigatorData;
    } catch (error) {
        console.error("Failed to refresh navigator data:", error);
        throw error;
    } finally {
        hideContentLoading(loadingToken);
    }
}

/**
 * Returns the edition's enriched navigator config of the current work. Fetches it if it has not been
 * loaded yet (the first connection can be shown before the first navigator refresh has finished).
 * @returns {Promise<Object>} The navigator data, or an empty one if the config is not available
 */
export async function ensureNavigatorConfig() {
    return appState.navigatorData.config ?? await loadNavigatorConfig() ?? { navigatorDefinition: [] };
}

/** The names of the two trailing categories of the concordance tab. */
function getConcordanceLabels() {
    return {
        additionalDocuments: getLangString("controller.navigator.Navigator_ConcordanceDocuments", "Weitere Dokumente"),
        additionalResources: getLangString("controller.navigator.Navigator_ConcordanceExternalResources", "Weitere Ressourcen")
    };
}

/**
 * Builds the navigator data for a concordance connection: its members are placed in the structure of the
 * edition's navigator config, the others are collected in "Weitere Dokumente" / "Weitere Ressourcen".
 * Names that neither the config nor the connection provides are fetched from the backend.
 * @param {string} plist - The plist of the connection
 * @returns {Promise<Object>} The enriched navigator data
 */
export async function buildConcordanceNavigatorDataFromPlist(plist) {
    const config = await ensureNavigatorConfig();
    return enrichNavigatorData(buildConcordanceNavigatorData(plist, config.navigatorDefinition, getConcordanceLabels()));
}

/**
 * Shows the members of a concordance connection in the "concordance" tab, which is created if there was none.
 * If a newer connection (or free exploration) comes in while this one is being built, the result is dropped.
 * @param {string} plist - The plist of the connection
 * @param {Object} [options]
 * @param {boolean} [options.selectTab=true] - Switch to the concordance tab, closing any open sub-navigator.
 *   If false, the navigator stays on the tab (or sub-navigator) it shows: the tab is only updated in the
 *   background, and a new one is announced by the tab bar.
 * @returns {Promise<void>}
 */
export async function showConcordanceInNavigator(plist, { selectTab = true } = {}) {
    const requestId = ++concordanceRequestId;
    const loadingToken = showContentLoading();
    let concordance;
    try {
        concordance = await buildConcordanceNavigatorDataFromPlist(plist);
    } finally {
        hideContentLoading(loadingToken);
    }
    if (requestId !== concordanceRequestId) return;

    updateNavigatorState(selectTab
        ? { concordance, activeTab: CONCORDANCE_TAB, subNavigators: [] }
        : { concordance });
    renderNavigator();
}

/**
 * Removes the "concordance" tab, for free exploration. The navigator is back on the "main" tab.
 */
export function clearConcordanceFromNavigator() {
    concordanceRequestId++;
    updateNavigatorState({ concordance: null, activeTab: MAIN_TAB, subNavigators: [] });
    renderNavigator();
}

/**
 * Opens a sub-navigator that lists the given targets (one document or link per entry) instead of the tabs.
 * "Back" closes it again, see `navigateBackInNavigator`.
 * @param {Array<{target: string, config: Object}>} parsedTargets - The parsed target objects
 * @returns {Promise<void>}
 */
export async function showSubNavigator(parsedTargets) {
    const loadingToken = showContentLoading();
    let navigatorData;
    try {
        navigatorData = await enrichNavigatorData(buildNavigatorDataFromParsedTargets(parsedTargets));
    } finally {
        hideContentLoading(loadingToken);
    }

    updateNavigatorState({ subNavigators: [...appState.navigatorData.subNavigators, navigatorData] });
    renderNavigator();
}

/**
 * Creates and returns an `<edirom-navigator>` web component showing the current navigator state and
 * a listener for `load-links-request` events. Loads the navigator config if it is not there yet.
 * @returns {Promise<HTMLElement>} The configured navigator element
 */
export async function buildNavigator() {
    const navigatorElement = document.createElement("edirom-navigator");
    navigatorElement.classList.add("web-component");
    navigatorElement.setAttribute("layout-mode", "mobile");
    navigatorElement.setAttribute("no-content-message", "(Noch) keine Inhalte für diesen Kontext verfügbar.");
    renderNavigator(navigatorElement);

    if (!appState.navigatorData.config) {
        refreshNavigatorDataFromBackend().catch(() => {
            // On failure, loading is cleared in refreshNavigatorDataFromBackend.
        });
    }

    navigatorElement.addEventListener("load-links-request", (event) => {
        loadLinks(event.detail, { "behaviour": "updateViewOrSwitchToNavigator" });

    });
    // The navigator is rebuilt whenever the page is shown again; it should come up on the tab the user left it on
    navigatorElement.addEventListener("active-tab-changed", (event) => {
        updateNavigatorState({ activeTab: event.detail.activeTab });
    });
    return navigatorElement;
}

/**
 * Closes the last sub-navigator to navigate back to the level before it. If there is none (the tabs
 * are shown), does nothing and returns `false`.
 * @returns {boolean} `true` if a sub-navigator was closed, `false` if the tabs were shown already
 */
export function navigateBackInNavigator() {
    const { subNavigators } = appState.navigatorData;
    if (subNavigators.length === 0) return false;

    updateNavigatorState({ subNavigators: subNavigators.slice(0, -1) });
    renderNavigator();
    return true;
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
 * `setAsConcordanceNavigation`, and `addToCurrentNavigation` keys from the original
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
    delete config.setAsConcordanceNavigation;
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