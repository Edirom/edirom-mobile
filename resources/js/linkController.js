import { appState } from "./config.js";
import { parseTargets, buildTargetsStringWithConfig } from "./targets.js";
import { createViewWindow, updateCurrentView } from "./views.js";
import { splitTargetIntoDocAndIds } from "./utils.js";
import { showConcordanceInNavigator, showSubNavigator } from "./navigator.js";
import { showNavigator } from "./pages.js";
import { applyUrlParams } from "./main.js";

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
 * If `setAsConcordanceNavigation` or `addToCurrentNavigation` is set in the config,
 * the resolved targets are also shown in the navigator: as the content of its
 * concordance tab (which the navigator switches to, see `options`), or as a sub-navigator.
 * @param {string} plist - A targets string as accepted by `parseTargets`
 * @param {Object} [additionalConfig={}] - Extra key-value pairs merged into the
 *   parsed config (existing plist keys take precedence)
 * @param {Object} [options={}]
 * @param {boolean} [options.selectConcordanceTab=true] - Whether showing the targets in the concordance tab
 *   also switches the navigator to that tab. Pass false if the user did not cause the change.
 * @returns {Promise<void>}
 */
export async function loadLinks(plist, additionalConfig = {}, { selectConcordanceTab = true } = {}) {
    console.log("Loading links from plist:", plist);
    let parsedTargets = parseTargets(plist, additionalConfig);

    if (parsedTargets.length === 0) {
        const configuredBehaviour = additionalConfig?.behaviour;
        const setAsConcordanceNavigation = additionalConfig?.setAsConcordanceNavigation || false;
        const addToCurrentNavigation = additionalConfig?.addToCurrentNavigation || false;

        if (setAsConcordanceNavigation) {
            await showConcordanceInNavigator(plist, { selectTab: selectConcordanceTab });
        } else if (addToCurrentNavigation) {
            await showSubNavigator(parsedTargets);
        }

        const shouldSwitchToNavigator = [
            "switchToNavigator",
            "updateViewOrSwitchToNavigator",
            "updateViewOrCreateViewWindowOrSwitchToNavigator"
        ].includes(configuredBehaviour) && appState.page !== "navigator";

        if (shouldSwitchToNavigator) {
            await showNavigator();
        }
        return;
    }

    let shouldSwitchToNavigator = false;

    let setAsConcordanceNavigation = parsedTargets[0]?.config?.setAsConcordanceNavigation || false;
    let addToCurrentNavigation = parsedTargets[0]?.config?.addToCurrentNavigation || false;

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

    if (setAsConcordanceNavigation) {
        // The members of the concordance connection get their own tab, arranged like the edition's navigator config
        await showConcordanceInNavigator(plist, { selectTab: selectConcordanceTab });
    } else if (addToCurrentNavigation) {
        await showSubNavigator(parsedTargets);
    }
    if (shouldSwitchToNavigator) {
        await showNavigator();
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
        else if (uriType === "selfLink") {
            const urlParams = new URL(target).searchParams;
            applyUrlParams(urlParams);
            return true;
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
 * @returns {"doc"|"selfLink"|"externalLink"|"unknown"} `"doc"` for `xmldb:exist://...` URIs,
 *   `"selfLink"` for HTTP/WWW URLs that share the running client's origin and pathname,
 *   `"externalLink"` for all other HTTP/WWW URLs, `"unknown"` otherwise
 */
export function getUriType(uri) {
    if (uri.startsWith("xmldb:exist")) {
        return "doc";
    }
    if (uri.startsWith("http") || uri.startsWith("www")) {
        try {
            const url = new URL(uri);
            if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
                return "selfLink";
            }
        } catch {
            // Malformed URL — fall through to "externalLink"
        }
        return "externalLink";
    }
    return "unknown";
}

export { parseTargets, buildTargetsStringWithConfig };
