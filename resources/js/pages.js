import { appState } from "./config.js";
import { buildNavigator } from "./navigator.js";

// Flag to skip the next popstate event (used when we call history.go(1) ourselves)
let skipNextPopstate = false;

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
function handleBeforeUnload(event) {
    event.preventDefault();
    // Modern browsers require returnValue to be set
    event.returnValue = '';
    return '';
}

// Ask the active component (if any) to handle back navigation first.
function requestComponentsBackHandling() {
    // TODO: Find out if popovers are open and close them first
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

export async function switchPage(pageName, newContent, { pushState = true, replaceState = false } = {}) {
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

    // Manage history stack
    if (replaceState) {
        // Use replaceState for initial page load to claim the browser's initial history entry
        window.history.replaceState({ ...appState }, "");
    } else if (pushState) {
        // Use pushState for normal navigation (skip when restoring from popstate)
        window.history.pushState({ ...appState }, "");
    }
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
    console.log("popstate event:", event);
    console.log("history.length:", window.history.length);

    // Skip this popstate if it was triggered by our own history.go(1) call
    if (skipNextPopstate) {
        console.log("Skipping popstate (triggered by history.go(1))");
        skipNextPopstate = false;
        return;
    }

    // Handle null state (shouldn't happen with replaceState on init, but just in case)
    if (!event.state) {
        console.log("popstate with null state - restoring navigator");
        await switchPage("navigator", buildNavigator(), { replaceState: true });
        return;
    }

    if (event.state?.currentPage) {
        let pageToRestore = event.state.currentPage;

        const handledByComponent = requestComponentsBackHandling();
        console.log("handledByComponent?:", handledByComponent);
        if (handledByComponent) {
            console.log("Component handled back navigation.");
            // Component consumed the back request; navigate forward to stay on current page.
            // Using history.go(1) instead of pushState to avoid Chrome's 
            // "History Manipulation Intervention" which marks entries as skippable
            // when pushState is called during popstate without user activation.
            // See: https://chromium.googlesource.com/chromium/src/+/eef521b43a410cb55d4e5b27eec28f826484bfea
            skipNextPopstate = true; // Prevent the next popstate from being processed
            window.history.go(1);
            return;
        }
        console.log("Not handled by Component. Restoring page:", pageToRestore);

        if (pageToRestore === "views") {
            // We do not have enough information (especially if the concordance was switched) to restore the views page properly
            // Use pushState: false to avoid creating duplicate history entries during popstate restoration
            await switchPage("navigator", buildNavigator(), { pushState: false });
        } else if (pageToRestore === "navigator") {
            // Use pushState: false to avoid creating duplicate history entries during popstate restoration
            await switchPage("navigator", buildNavigator(), { pushState: false });
        }
    }
});