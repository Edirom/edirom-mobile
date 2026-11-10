import { appState, setAppState } from "./config.js";
import { getLangString } from "./languageController.js";
import { buildNavigator, navigateBackInNavigator } from "./navigator.js";
import { getAllEditions } from "./api.js";
import { initEdition } from "./main.js";
import { resetContentLoadingState } from "./loading.js";
import { disposeImageViewers } from "./imageView.js";
import { buildAboutPage } from "./about.js";
import { captureViewFrame, restoreViewFrame, viewLeavesOnBack } from "./views.js";
import { createNavigationStack } from "./navigationStack.js";

/**
 * Where "Back" goes. The browser history only tells us that the user pressed Back; what it means is decided by
 * the navigation stack (navigationStack.js), which has one frame per page the user can return to. A Back is
 * resolved in this order (see `handlePopstate`):
 *  1. something inside the page takes it: an open overlay, the detail page of the annotation view, a
 *     sub-navigator (`consumeBackInPage`). The browser's step back is then undone.
 *  2. otherwise the page is left: the frame below is rebuilt (`restoreFrame`). A frame of a view window carries
 *     what was captured of its view when the user left it (see `captureViewFrame` in views.js).
 */
const navigationStack = createNavigationStack();

/** Frame id of the page on screen. The stack can already point elsewhere while a page is being rebuilt. */
let displayedFrameId = null;

// Identifies the latest navigation that was started. A page is only switched to if no newer navigation has
// begun meanwhile (e.g. the user pressed Back while a view window was still loading).
let navigationToken = 0;

/**
 * Starts a navigation and returns its token. Whatever is waiting for data (a view window that is fetched, a
 * page that is built) has to check `isCurrentNavigation(token)` before it switches the page.
 * @returns {number}
 */
export function beginNavigation() {
    return ++navigationToken;
}

/**
 * @param {number} token - A token from `beginNavigation`
 * @returns {boolean} `false` if a newer navigation has been started since, so this one is obsolete
 */
export function isCurrentNavigation(token) {
    return token === navigationToken;
}

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
 * Dispatches a cancelable 'back-request' event to each of the targets in turn, allowing web components to
 * handle back navigation internally (e.g., closing a detail view).
 * @param {Iterable<Element>} targets
 * @returns {boolean} true if a component handled the back request
 */
function dispatchBackRequest(targets) {
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
 * Gives the page a chance to handle a Back itself before it is left: web components get a cancelable
 * 'back-request' event, and a sub-navigator is closed.
 * @returns {boolean} true if something inside the page handled the back request
 */
function consumeBackInPage() {
    // First pass: global components outside #content-container (header, footer)
    // that declare they can handle back navigation (e.g. open popovers).
    if (dispatchBackRequest(document.querySelectorAll('[data-handles-back-request]'))) {
        return true;
    }

    // Second pass: content-area web components (e.g. annotation view detail page). A view can leave this
    // out when its page has to be left straight away (see `leaveOnBack` in views.js).
    const contentContainer = document.getElementById("content-container");
    const returnsToView = navigationStack.previous?.kind === "views";
    const viewLeaves = appState.page === "views" && viewLeavesOnBack({ returnsToView });
    if (contentContainer && !viewLeaves && dispatchBackRequest(contentContainer.querySelectorAll(".web-component"))) {
        return true;
    }

    // Navigate back through the sub-navigator stack
    return appState.page === "navigator" && navigateBackInNavigator();
}

/**
 * What is stored when a page is left: what is needed to rebuild it. Only view windows have anything to store
 * (see `captureViewFrame` in views.js); the other pages are rebuilt from the app state.
 * @returns {Object|null}
 */
function captureLeavingPage() {
    return appState.page === "views" ? captureViewFrame() : null;
}

/**
 * Brings the navigation stack and the browser history in line with the page that was just switched to.
 * @param {string} pageName - The page that is shown now
 * @param {"push"|"reset"|"restore"} mode - See `switchPage`
 * @param {string} previousPage - The page that was shown before
 * @param {Object|null} leaving - What was captured of the page that is left (only for `push`)
 */
function commitHistory(pageName, mode, previousPage, leaving) {
    if (mode === "restore") {
        // The browser is on the entry of this frame already, and the stack was cut back to it (popstate).
        displayedFrameId = navigationStack.top?.id ?? null;
        return;
    }

    const stack = navigationStack;
    if (leaving) {
        stack.update(displayedFrameId, leaving);
    }

    let write;
    if (mode === "reset") {
        // The first page of the app takes a history entry of its own, above the one the page was loaded with
        // (see the "guard" case in `handlePopstate`). Later roots take over the entry that is current.
        write = stack.depth >= 0 ? "replaceState" : "pushState";
        stack.reset(pageName);
    } else if (previousPage === pageName && pageName !== "views" && stack.depth >= 0) {
        // The same page again (e.g. "About" while "About" is shown) is no new page to go Back to.
        write = "replaceState";
        stack.replaceTop(pageName);
    } else {
        write = "pushState";
        stack.push(pageName);
    }
    window.history[write](stack.historyState(pageName), "");
    displayedFrameId = stack.top.id;
}

/**
 * Switches the app to a new page, managing content, navigation stack and browser history.
 * @param {string} pageName - The name of the page to switch to
 * @param {HTMLElement|Promise<HTMLElement>|(() => HTMLElement|Promise<HTMLElement>)} content - The content to
 *   display. A function is called once what is on screen has been captured (see `captureLeavingPage`), which
 *   matters for pages whose construction replaces the state of the one that is left.
 * @param {Object} [options]
 * @param {"push"|"reset"|"restore"} [options.history="push"] - `"push"`: a page that "Back" returns from, to the
 *   one that is left. `"reset"`: a new root, all earlier pages are forgotten. `"restore"`: "Back" has returned
 *   to a page below, whose frame is on top of the stack already; history and stack are left alone.
 * @param {number} [options.navigation] - The token of the navigation this belongs to (`beginNavigation`); a
 *   new one is started if omitted
 * @returns {Promise<boolean>} `true` if the page was switched, `false` if a newer navigation replaced this one
 */
export async function switchPage(pageName, content, { history: mode = "push", navigation = beginNavigation() } = {}) {
    console.log("Switching to page:", pageName, "with history:", mode);

    const previousPage = appState.page;
    const leaving = mode === "push" ? captureLeavingPage() : null;

    const resolvedContent = await (typeof content === "function" ? content() : content);
    if (!isCurrentNavigation(navigation)) {
        console.log("Not switching to page", pageName, "- a newer navigation has begun");
        return false;
    }

    const contentContainer = document.getElementById("content-container");
    disposeImageViewers(contentContainer);
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

    commitHistory(pageName, mode, previousPage, leaving);
    return true;
}

/**
 * Ensures the navigator page is visible.
 *
 * If the navigator is already active and mounted, this is a no-op by default
 * to avoid unnecessary remounts of `<edirom-navigator>`. Set `forceRemount`
 * to true when a full rebuild is explicitly required.
 *
 * The navigator is the root of the app: showing it starts the navigation stack over (`history: "reset"`).
 *
 * @param {Object} options - History and remount options
 * @param {"reset"|"restore"} [options.history="reset"] - See `switchPage`
 * @param {boolean} [options.forceRemount=false] - Force rebuilding navigator even when already active
 * @param {number} [options.navigation] - The token of the navigation this belongs to, see `switchPage`
 * @returns {Promise<boolean>} `true` if a page switch occurred, `false` if skipped
 */
export async function showNavigator({ history = "reset", forceRemount = false, navigation } = {}) {
    const navigatorElement = document.querySelector("#content-container edirom-navigator");
    const isNavigatorActive = appState.page === "navigator" && !!navigatorElement;

    if (isNavigatorActive && !forceRemount) {
        return false;
    }

    resetContentLoadingState();
    return switchPage("navigator", () => buildNavigator(), { history, navigation });
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

/**
 * Shows the root of the app: the navigator if it can be shown, else the edition selection.
 * @param {number} [navigation] - The token of the navigation this belongs to, see `switchPage`
 * @returns {Promise<boolean>}
 */
async function showRoot(navigation) {
    if (canShowNavigator()) {
        return showNavigator({ history: "reset", forceRemount: true, navigation });
    }
    return switchPage("edition-selection", () => buildEditionSelectionPage(), { history: "reset", navigation });
}

/**
 * Rebuilds the page of a frame that "Back" has returned to.
 * @param {{kind: string}} frame - The frame, see navigationStack.js
 * @param {number} navigation - The token of this navigation, see `beginNavigation`
 * @returns {Promise<boolean>} `false` if the page could not be rebuilt or was superseded
 */
function restoreFrame(frame, navigation) {
    switch (frame.kind) {
        case "navigator":
            return showNavigator({ history: "restore", forceRemount: true, navigation });
        case "views":
            return restoreViewFrame(frame, { navigation });
        case "about":
            return switchPage("about", () => buildAboutPage(), { history: "restore", navigation });
        case "edition-selection":
            return switchPage("edition-selection", () => buildEditionSelectionPage(), { history: "restore", navigation });
        default:
            return Promise.resolve(false);
    }
}

/**
 * Moves the browser's position in the history. Used to undo a step the browser took by itself when the Back
 * did not leave the page. The `popstate` this causes lands on the frame on screen and is ignored there.
 * @param {number} entries - Positive: forward, negative: back
 */
function moveHistory(entries) {
    if (entries !== 0) {
        window.history.go(entries);
    }
}

/**
 * Handles browser back/forward navigation. The history entries carry `{depth, gen}` (see navigationStack.js),
 * so the event says by itself which frame the browser moved to.
 *
 * - `same`: the frame on screen, nothing to do. This is also what our own `moveHistory` ends in.
 * - `forward`: to a frame that was left by going back. It is gone: return to the frame on screen.
 * - otherwise it is a Back (to a frame below, past the first one onto the entry the page was loaded with, or
 *   onto a stale entry). The page gets the chance to handle it first (`consumeBackInPage`), and the browser's
 *   step is undone with `moveHistory` (using `history.go` rather than pushState, which Chrome's History
 *   Manipulation Intervention would mistrust). If nothing handles it, the frame below is rebuilt.
 *
 * @see https://chromium.googlesource.com/chromium/src/+/eef521b43a410cb55d4e5b27eec28f826484bfea
 * @param {PopStateEvent} event
 */
async function handlePopstate(event) {
    const stack = navigationStack;
    const arrival = stack.classifyPopstate(event.state);

    if (arrival.type === "same") {
        return;
    }

    if (arrival.type === "forward") {
        moveHistory(stack.depth - arrival.depth);
        return;
    }

    // How far the browser moved back from the frame on screen (the number of history entries between)
    const entriesBack = arrival.type === "back" ? stack.depth - arrival.depth
        : arrival.type === "guard" ? stack.depth + 1
            : 1;

    // Let the page handle the Back internally first. Not while a page is still being rebuilt after an earlier
    // Back: what is on screen is a page that has been left already, and must not be asked.
    const screenLagsStack = stack.top?.id !== displayedFrameId;
    if (!screenLagsStack && consumeBackInPage()) {
        // Something inside the page handled it - navigate forward to stay on the current page
        moveHistory(entriesBack);
        return;
    }

    if (arrival.type === "back") {
        // History and stack agree again at once, the page follows when it is rebuilt
        stack.truncateTo(arrival.depth);
        const navigation = beginNavigation();
        let restored = false;
        try {
            restored = await restoreFrame(stack.top, navigation);
        } catch (error) {
            console.error("Could not rebuild the page that Back returns to:", error);
        }
        if (!restored && isCurrentNavigation(navigation)) {
            // The page cannot be rebuilt (e.g. its document is gone): start over from the root
            await showRoot(navigation);
        }
        return;
    }

    if (arrival.type === "stale") {
        // An entry of an earlier navigation: stay where we are (there is nothing to go back to)
        moveHistory(1);
        return;
    }

    // "guard": Back from the first page. Show the root again, on the entry the user landed on.
    await showRoot();
}

window.addEventListener("popstate", (event) => {
    handlePopstate(event).catch((error) => console.error("Back navigation failed:", error));
});
