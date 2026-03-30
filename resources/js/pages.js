import { appState } from "./config.js";
import { buildNavigator, navigateBackInNavigator } from "./navigator.js";
import { getAllEditions } from "./api.js";
import { initEdition } from "./main.js";

// Flag to skip the next popstate event (set when we call history.go(1) ourselves)
let skipNextPopstate = false;

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
/**
 * Triggers the browser's native "Leave site?" dialog on page unload.
 */
function handleBeforeUnload(event) {
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
    appState.page = pageName;

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
 * Builds and returns the "About Edirom Mobile" page element.
 * @returns {HTMLElement} The page container element
 */
export function buildAboutEdiromMobilePage() {
    const aboutPageContainer = document.createElement("div");
    aboutPageContainer.id = "about-edirom-mobile-page";

    const heading = document.createElement("h1");
    heading.textContent = "Über Edirom Mobile";
    aboutPageContainer.appendChild(heading);

    const paragraph = document.createElement("p");
    paragraph.textContent = "Edirom Mobile ist eine mobile Anwendung zur Anzeige und Navigation von digitalen Editionen.";
    aboutPageContainer.appendChild(paragraph);

    return aboutPageContainer;
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
    heading.textContent = "Edition auswählen";
    editionSelectionContainer.appendChild(heading);

    const editionList = document.createElement("ul");
    appState.allEditions.forEach(edition => {
        const listItem = document.createElement("li");
        const editionLink = document.createElement("span");
        editionLink.textContent = edition.name;
        editionLink.addEventListener("click", () => {
            console.log("Selected edition:", edition);
            initEdition({
                editionId: edition.id,
                backendUrl: edition.backendUrl
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
window.addEventListener("popstate", async (event) => {
    // Skip popstate events triggered by our own history.go(1) calls
    if (skipNextPopstate) {
        skipNextPopstate = false;
        return;
    }

    // Fallback for null state (e.g., if replaceState wasn't called on init)
    if (!event.state) {
        await switchPage("navigator", buildNavigator(), { replaceState: true });
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
            // Already at main navigator - block further back navigation
            skipNextPopstate = true;
            window.history.go(1);
            return;
        }

        // From views or other pages, fall back to navigator
        await switchPage("navigator", buildNavigator(), { pushState: false });
    }
});