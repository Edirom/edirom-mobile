import { appState } from "./config.js";
import { buildNavigator } from "./navigator.js";

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
function handleBeforeUnload(event) {
    event.preventDefault();
    // Modern browsers require returnValue to be set
    event.returnValue = '';
    return '';
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

window.addEventListener("popstate", async (event) => {
    if (event.state?.currentPage) {
        let pageToRestore = event.state.currentPage;
        console.log("Page to restore:", pageToRestore);

        if (pageToRestore === "views") {
            // We do not have enough information (especially if the concordance was switched) to restore the views page properly
            await switchPage("navigator", buildNavigator());
        }
        if (pageToRestore === "navigator") {
            await switchPage("navigator", buildNavigator());
        }
    }
});