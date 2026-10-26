import { appState, setAppState } from "./config.js";
import { getLangString } from "./languageController.js";
import { buildNavigator, navigateBackInNavigator } from "./navigator.js";
import { getAllEditions } from "./api.js";
import { initEdition } from "./main.js";
import { resetContentLoadingState } from "./loading.js";

// Flag to skip the next popstate event (set when we call history.go(1) ourselves)
let skipNextPopstate = false;

// One-shot flag: lets a deliberate, app-initiated navigation (e.g. "switch to desktop")
// pass the beforeunload guard once. Consumed by handleBeforeUnload.
let allowUnload = false;

/**
 * Lets the next page unload pass without the native "Leave site?" dialog.
 * Call immediately before an intentional navigation away from the app. The
 * exemption is one-shot and also expires after a short timeout, so a navigation
 * that never happens cannot leave the guard disabled. Back-navigation, reload
 * and tab close are unaffected.
 */
export function allowNextUnload() {
    allowUnload = true;
    setTimeout(() => {
        allowUnload = false;
    }, 1000);
}

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
/**
 * Triggers the browser's native "Leave site?" dialog on page unload,
 * unless the unload was explicitly allowed via allowNextUnload().
 */
function handleBeforeUnload(event) {
    if (allowUnload) {
        allowUnload = false;
        return;
    }
    event.preventDefault();
    event.returnValue = '';
    return '';
}

/**
 * Dispatches a cancelable 'back-request' event to web components, allowing them
 * to handle back navigation internally (e.g., closing a detail view).
 * @returns {boolean} true if a component handled the back request
 */
function requestComponentsBackHandling() {
    // First pass: global components outside #content-container (header, footer)
    // that declare they can handle back navigation (e.g. open popovers).
    const globalTargets = document.querySelectorAll('[data-handles-back-request]');
    for (const target of globalTargets) {
        const backRequestEvent = new CustomEvent("back-request", {
            cancelable: true,
            bubbles: true,
            composed: true
        });
        target.dispatchEvent(backRequestEvent);
        if (backRequestEvent.defaultPrevented) {
            return true;
        }
    }

    // Second pass: content-area web components (e.g. annotation view detail page).
    const contentContainer = document.getElementById("content-container");
    if (!contentContainer) return false;

    const targets = contentContainer.querySelectorAll(".web-component");
    if (!targets || targets.length === 0) return false;

    for (const target of targets) {
        const backRequestEvent = new CustomEvent("back-request", {
            cancelable: true,
            bubbles: true,
            composed: true
        });
        target.dispatchEvent(backRequestEvent);
        if (backRequestEvent.defaultPrevented) {
            return true;
        }
    }
    return false;
}

/**
 * Switches the app to a new page, managing content, state, and browser history.
 * @param {string} pageName - The name of the page to switch to
 * @param {HTMLElement|Promise<HTMLElement>} newContent - The content to display
 * @param {Object} options - History management options
 * @param {boolean} options.pushState - Whether to push a new history entry (default: true)
 * @param {boolean} options.replaceState - Whether to replace the current history entry (default: false)
 */
export async function switchPage(pageName, newContent, { pushState = true, replaceState = false } = {}) {
    console.log("Switching to page:", pageName, "with options:", { pushState, replaceState });

    const resolvedContent = await newContent;

    const contentContainer = document.getElementById("content-container");
    contentContainer.innerHTML = "";
    contentContainer.appendChild(resolvedContent);
    setAppState({ page: pageName });

    const concordanceWrapper = document.getElementById("concordance-navigator-wrapper");
    if (concordanceWrapper) {
        const showConcordance = pageName === "navigator" || pageName === "views";
        concordanceWrapper.style.display = showConcordance ? "" : "none";
        if (!showConcordance) {
            const concordanceNavigator = concordanceWrapper.querySelector("edirom-concordance-navigator");
            concordanceNavigator?.setCollapseState(true, { animate: false, fireLayoutChange: false });
        }
    }

    // Warn user before leaving when on the main navigator page
    if (pageName === "navigator") {
        window.addEventListener("beforeunload", handleBeforeUnload);
    } else {
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // Manage browser history
    if (replaceState) {
        // Used for initial page load to claim the browser's initial history entry
        window.history.replaceState({ ...appState }, "");
    } else if (pushState) {
        window.history.pushState({ ...appState }, "");
    }
    // When both are false, we're restoring from popstate - don't modify history
}

/**
 * Ensures the navigator page is visible.
 *
 * If the navigator is already active and mounted, this is a no-op by default
 * to avoid unnecessary remounts of `<edirom-navigator>`. Set `forceRemount`
 * to true when a full rebuild is explicitly required.
 *
 * @param {Object} options - History and remount options
 * @param {boolean} [options.pushState=true] - Whether to push a new history entry
 * @param {boolean} [options.replaceState=false] - Whether to replace current history entry
 * @param {boolean} [options.forceRemount=false] - Force rebuilding navigator even when already active
 * @returns {Promise<boolean>} `true` if a page switch occurred, `false` if skipped
 */
export async function showNavigator({ pushState = true, replaceState = false, forceRemount = false } = {}) {
    const navigatorElement = document.querySelector("#content-container edirom-navigator");
    const isNavigatorActive = appState.page === "navigator" && !!navigatorElement;

    if (isNavigatorActive && !forceRemount) {
        return false;
    }

    resetContentLoadingState();
    await switchPage("navigator", buildNavigator(), { pushState, replaceState });
    return true;
}

/**
 * Builds and returns the edition selection page. If no editions have been loaded
 * yet, fetches them first. Renders a list of all available editions; clicking one
 * initiates the app with the selected edition.
 * @returns {Promise<HTMLElement>} The page container element
 */
export async function buildEditionSelectionPage() {

    if (!appState.allEditions || appState.allEditions.length === 0) {
        await getAllEditions();
    }


    const editionSelectionContainer = document.createElement("div");
    editionSelectionContainer.id = "edition-selection-page";

    const heading = document.createElement("h1");
    heading.textContent = getLangString("mobile.Pages_selectEdition", "Select edition");
    editionSelectionContainer.appendChild(heading);

    const editionList = document.createElement("ul");
    appState.allEditions.forEach(edition => {
        const listItem = document.createElement("li");
        const editionLink = document.createElement("span");
        editionLink.textContent = edition.name;
        editionLink.addEventListener("click", () => {
            console.log("Selected edition:", edition);
            initEdition({
                editionId: edition.id
            });
        });
        listItem.appendChild(editionLink);
        editionList.appendChild(listItem);
    });
    editionSelectionContainer.appendChild(editionList);

    return editionSelectionContainer;
}

/**
 * Handles browser back/forward navigation.
 * 
 * Strategy:
 * 1. First, give web components a chance to handle the back request internally
 * 2. If a component handles it, use history.go(1) to cancel the navigation
 *    (using pushState would trigger Chrome's History Manipulation Intervention)
 * 3. If no component handles it, restore the appropriate page
 * 
 * @see https://chromium.googlesource.com/chromium/src/+/eef521b43a410cb55d4e5b27eec28f826484bfea
 */
/**
 * Returns true if the navigator page can be meaningfully shown:
 * either saved navigator data exists to re-render, or both edition and work
 * are set so that getNavigatorConfig() can be called successfully.
 * @returns {boolean}
 */
function canShowNavigator() {
    const { config, concordance, subNavigators } = appState.navigatorData;
    const hasNavigatorData = config !== null || concordance !== null || subNavigators.length > 0;
    const canFetchNavigatorData = !!(appState.edition?.doc && appState.work?.id);
    return hasNavigatorData || canFetchNavigatorData;
}

window.addEventListener("popstate", async (event) => {
    // Skip popstate events triggered by our own history.go(1) calls
    if (skipNextPopstate) {
        skipNextPopstate = false;
        return;
    }

    // Fallback for null state (e.g., if replaceState wasn't called on init)
    if (!event.state) {
        if (canShowNavigator()) {
            await showNavigator({ replaceState: true, forceRemount: true });
        } else {
            await switchPage("edition-selection", buildEditionSelectionPage(), { replaceState: true });
        }
        return;
    }

    if (event.state?.page) {
        // Let components handle internal back navigation first
        if (requestComponentsBackHandling()) {
            // Component handled it - navigate forward to stay on current page
            skipNextPopstate = true;
            window.history.go(1);
            return;
        }

        // No component handled it - restore the appropriate page
        if (appState.page === "navigator") {
            // Navigate back through sub-navigator stack
            if (navigateBackInNavigator()) {
                // Popped a level - stay on navigator with updated data
                return;
            }
            // Already at the tabs - block further back navigation
            skipNextPopstate = true;
            window.history.go(1);
            return;
        }

        // From views or other pages, fall back to navigator if possible
        if (canShowNavigator()) {
            await showNavigator({ pushState: false });
        } else {
            await switchPage("edition-selection", buildEditionSelectionPage(), { pushState: false });
        }
    }
});