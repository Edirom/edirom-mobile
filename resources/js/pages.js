import { appState } from "./config.js";
import { buildNavigator } from "./navigator.js";

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
function handleBeforeUnload(event) {
    event.preventDefault();
    // Modern browsers require returnValue to be set
    event.returnValue = '';
    return '';
}

// Ask the active component (if any) to handle back navigation first.
function requestComponentsBackHandling() {
    const contentContainer = document.getElementById("content-container");
    if (!contentContainer) return false;

    const targets = contentContainer.querySelectorAll(".web-component");
    console.log("targets for back handling:", targets);
    if (!targets || targets.length === 0) return false;

    let handled = false;
    targets.forEach(target => {
        if (handled) return; // short-circuit once handled

        const backRequestEvent = new CustomEvent("back-request", {
            cancelable: true,
            bubbles: true,
            composed: true
        });

        target.dispatchEvent(backRequestEvent);
        if (backRequestEvent.defaultPrevented) {
            handled = true;
        }
    });

    return handled;
}

export async function switchPage(pageName, newContent) {
    // Resolve content in case an async builder returns a Promise
    const resolvedContent = await newContent;

    console.log("Switching to page:", pageName, resolvedContent);
    const contentContainer = document.getElementById("content-container");
    contentContainer.innerHTML = ""; // Clear previous content
    contentContainer.appendChild(resolvedContent);
    appState.currentPage = pageName;

    // Manage beforeunload listener based on current page
    // When on navigator (main page), warn user before leaving the site
    if (pageName === "navigator") {
        window.addEventListener("beforeunload", handleBeforeUnload);
    } else {
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // add to history stack
    window.history.pushState(appState, "");
}

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

window.addEventListener("popstate", async (event) => {
    if (event.state?.currentPage) {
        let pageToRestore = event.state.currentPage;

        const handledByComponent = requestComponentsBackHandling();
        console.log("handledByComponent?:", handledByComponent);
        if (handledByComponent) {
            console.log("Component handled back navigation.");
            // Component consumed the back request; re-arm state to keep SPA navigation alive
            window.history.pushState(appState, "");
            return;
        }
        console.log("Not handled by Component. Restoring page:", pageToRestore);

        if (pageToRestore === "views") {
            // We do not have enough information (especially if the concordance was switched) to restore the views page properly
            await switchPage("navigator", buildNavigator());
        }
        if (pageToRestore === "navigator") {
            await switchPage("navigator", buildNavigator());
        }
    }
});