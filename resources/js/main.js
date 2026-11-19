import { appState, setAppState, loadAppConfig } from "./config.js";
import { getAllEditions, getWorks } from "./api.js";
import { setupHeaderMenu, renderHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage, buildEditionSelectionPage, showNavigator } from "./pages.js";
import { initConcordanceNavigator, navigateConcordanceNavigatorToConnection, navigateConcordanceNavigatorToDisabled } from "./concordanceNavigator.js";
import { initConnectedWorkspace, updateConnectedWorkspaceInviteUrl, applyWorkspaceSession, notifyStateChanged, getSyncedState, setConnectedWorkspaceLanguage } from "./connected-workspace.js";
import { showContentLoading, hideContentLoading } from "./loading.js";
import { applyLanguage, onLanguageApplied } from "./languageController.js";
import { resetNavigatorData } from "./navigator.js";
import { createViewWindow } from "./views.js";
import { paramsFromLocation, readDocumentLink } from "./documentLink.js";
import { planContextNavigation } from "./contextPlan.js";


/**
 * Finds a work among those loaded for the current edition, matching either
 * the short `id` or the full `doc` URI — the same two identifiers editions
 * carry (see `initEdition`'s matching for why both are accepted).
 * @param {string} workId - The work identifier to look for
 * @returns {Object|undefined} The matching work object, or undefined if not found
 */
function findWorkInEdition(workId) {
    return appState.worksInEdition.find((work) => work.id === workId || work.doc === workId);
}






/**
 * Initializes the app for a given edition.
 *
 * If an `editionId` is provided, it's looked up among the configured backend's
 * editions. If no `editionId` is given and only one edition is available, that
 * edition is selected automatically. If the edition cannot be resolved, the
 * edition selection page is shown instead.
 *
 * @param {Object} [options]
 * @param {string|null} [options.editionId] - The edition ID to initialize
 * @param {string|null} [options.workId] - A specific work ID to initialize after the edition
 * @param {string|null} [options.connectionId] - A specific concordance connection ID to initialize after the work
 * @returns {Promise<void>}
 */
export async function initEdition({ editionId = null, workId = null, connectionId = null } = {}) {
    const loadingToken = showContentLoading();
    try {
    let foundEditionId = "";
    setAppState({
        edition: {},
        work: {},
        connection: null
    });

    if (!appState.allEditions || appState.allEditions.length === 0) {
        await getAllEditions();
    }

    if (editionId) {
        // Accept either identifier a caller might use: the short `id` (used
        // internally, e.g. by the edition-selection page) or the full `doc`
        // URI (used by Desktop, which has no concept of the short id — see
        // edition.xqm's edition:details()). Both are always present on every
        // edition object.
        const matchedEdition = appState.allEditions.find((edition) => edition.id === editionId || edition.doc === editionId);
        if (matchedEdition) {
            foundEditionId = matchedEdition.id;
        }
    }
    else if (appState.allEditions.length === 1) {
        foundEditionId = appState.allEditions[0].id;
    }

    // Without an edition the app starts over: the edition selection is a new root of the navigation stack
    if (foundEditionId == "") {
        // Edition nicht gefunden, öffne Editionsauswahlseite.
        switchPage("edition-selection", () => buildEditionSelectionPage(), { history: "reset" });
        return;
    }

    const editionData = appState.allEditions.find((edition) => edition.id === foundEditionId);

    if (!editionData) {
        console.error("Resolved edition ID is missing from cache", { foundEditionId });
        switchPage("edition-selection", () => buildEditionSelectionPage(), { history: "reset" });
        return;
    }

    setAppState({ edition: editionData });

    if (!appState.edition.doc) {
        console.error("Edition data is incomplete", appState.edition);
        switchPage("edition-selection", () => buildEditionSelectionPage(), { history: "reset" });
        return;
    }

    // The edition's preferences can set another language than the default preferences did at startup (like in
    // Edirom-Frontend's loadEdiromForEdition). Settle the language before anything is requested for the edition.
    await applyLanguage(appState.edition.doc);

    const worksInEdition = await getWorks(appState.edition.doc);
    setAppState({ worksInEdition });

    await initWork(workId, connectionId);
    } finally {
        hideContentLoading(loadingToken);
    }
}

/**
 * Initializes the app for a given work within the current edition.
 * If the requested work ID is not found, or no ID is given, the first available
 * work is used as a fallback. After resolving the work, updates the page title,
 * switches to the navigator page, and starts the concordance navigator.
 *
 * @param {string|null} [workId] - The work ID to initialize, or null to use the first available
 * @param {string|null} [connectionId] - The connection ID to initialize in the concordance navigator
 * @returns {Promise<void>}
 */
export async function initWork(workId = null, connectionId = null) {
    let foundWorkId = "";
    setAppState({
        work: {},
        connection: null
    });
    resetNavigatorData();

    if (workId) {
        const matchedWork = findWorkInEdition(workId);
        if (matchedWork) {
            foundWorkId = matchedWork.id;
        }
    }
    setAppState({ work: appState.worksInEdition.find((work) => work.id === foundWorkId) });
    if (appState.work == null || appState.work == undefined) {
        if (appState.worksInEdition.length > 0) {
            setAppState({ work: appState.worksInEdition[0] });
        }
        else {
            console.error("No works found for edition", appState.edition.id);
            return;
        }
    }

    setWorkTitle();

    if (connectionId) {
        const { initialConnectionResolved } = await initConcordanceNavigator(connectionId);
        if (!initialConnectionResolved) {
            await showNavigator({ forceRemount: true });
        }
    }
    else {
        await showNavigator({ forceRemount: true });
        await initConcordanceNavigator();
    }

    notifyStateChanged();
}


/**
 * Normalizes a raw URL parameter value: trims whitespace and returns `null` for
 * empty or missing values.
 * @param {string|null} value - The raw parameter value
 * @returns {string|null} The trimmed value, or `null` if absent or empty
 */
function normalizeParam(value) {
    if (value == null) return null;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
}

// The end of the last navigation started through `applyUrlParams`. A state the ws-server asks for can arrive
// while the startup navigation is still loading the edition; both must not run at the same time.
let navigationQueue = Promise.resolve();

/**
 * Applies a set of URL search parameters to initialize the app in the
 * corresponding state. Enforces the `edition > work > connection` hierarchy
 * (work requires edition; connection requires both) and delegates to
 * `initEdition`. This is the single point where URL parameters are translated
 * into app state, used on startup, when a self-link is activated and when the
 * connected workspace moves the app to a synced state. Calls are run one after
 * the other.
 *
 * A `session` parameter (the invite link of a connected workspace session, like
 * in Edirom-Frontend) joins that session, but only after the navigation is done:
 * the first state that the ws-server sends to a joiner must not race it.
 * @param {URLSearchParams} urlParams - The parameters to apply
 * @returns {Promise<void>}
 */
export function applyUrlParams(urlParams) {
    const run = navigationQueue.then(async () => {
        await runUrlParams(urlParams);
        applyWorkspaceSession(normalizeParam(urlParams.get("session")));
    });
    // A failed navigation must not block the ones after it
    navigationQueue = run.catch(() => {});
    return run;
}

async function runUrlParams(urlParams) {
    const editionId = normalizeParam(urlParams.get("edition"));
    let workId = normalizeParam(urlParams.get("work"));
    let connectionId = normalizeParam(urlParams.get("connection"));
    // The document is requested from the edition's backend context, so it needs an edition (a work is optional)
    const documentLink = editionId ? readDocumentLink(urlParams) : null;

    // Enforce URL parameter hierarchy without failing startup.
    // work requires edition, and connection requires both edition and work.
    if (!editionId) {
        workId = null;
        connectionId = null;
    }
    else if (!workId) {
        connectionId = null;
    }

    await navigateToContext({ editionId, workId, connectionId });

    if (documentLink) {
        await openDocumentLink(documentLink);
    }
}

/**
 * Opens a document in a view window on top of the navigator, so that "Back" returns to the navigator. The viewer
 * follows from the id of the link (see viewSelection.js). If the document cannot be opened (it does not exist, or
 * has no view Mobile can show), the user stays where the navigation to the edition and work left them.
 * @param {string} documentLink - The document URI with its optional `#id`
 * @returns {Promise<void>}
 */
async function openDocumentLink(documentLink) {
    // Without a resolved edition the edition selection is shown, and there is nothing to request the document from
    if (!appState.edition?.doc) return;
    await createViewWindow(documentLink);
}

/**
 * Moves the app to the edition, work and concordance connection that are asked for, taking the shortest way
 * (see `planContextNavigation`): what is open already is never reloaded.
 * @param {{editionId: string|null, workId: string|null, connectionId: string|null}} context - Already normalized
 *   to follow the `edition > work > connection` hierarchy
 * @returns {Promise<void>}
 */
async function navigateToContext({ editionId, workId, connectionId }) {
    const plan = planContextNavigation(
        { editionId, workId, connectionId },
        { edition: appState.edition, work: appState.work, hasWorks: appState.worksInEdition?.length > 0 }
    );

    // Same edition + same work, no connection: there is nothing to change. This is also what the invite link of a
    // connected workspace session asks for when the device has the edition and work open already; the app keeps its
    // navigator, views and connection, and the session is joined afterwards (see `applyUrlParams`).
    if (plan === "none") return;

    // Same edition + same work + a connection.
    // Reuse the existing concordance navigator element — nothing is rebuilt and the
    // scanner stays paused so it can resume instantly on next open.
    if (plan === "connection") {
        if (navigateConcordanceNavigatorToConnection(connectionId)) {
            updateConnectedWorkspaceInviteUrl();
        } else {
            // Not in the concordance data of this work: reinitializing would not find it either
            console.warn("The connection is not known for the open work, staying where the app is:", connectionId);
        }
        return;
    }

    // Same edition, different work.
    // Skip initEdition() and its backend availability checks; call initWork() directly.
    // Navigator data reset and rebuild are handled inside initWork().
    if (plan === "work") {
        await initWork(workId, connectionId);
        updateConnectedWorkspaceInviteUrl();
        return;
    }

    await initEdition({
        editionId,
        workId,
        connectionId
    });
    updateConnectedWorkspaceInviteUrl();
}

/**
 * Moves the app to a state the ws-server asked for (its `syncState`).
 * Registered with the connected workspace, which also takes care of not
 * reporting the result back as a new change.
 *
 * Other clients may identify an edition or work differently (Desktop uses the
 * edition's `doc` URI, mobile the short `id`), so both are resolved to this
 * app's ids first. `null` for edition/work means "no information" and leaves
 * the current value alone; for `connection` it means free exploration.
 *
 * @param {{edition?: string|null, work?: string|null, connection?: string|null}} patch
 * @returns {Promise<void>}
 */
async function applySyncedState(patch) {
    const current = getSyncedState();
    const target = { ...current };

    if (patch.edition) {
        const edition = appState.allEditions?.find((e) => e.id === patch.edition || e.doc === patch.edition);
        target.edition = edition?.id ?? patch.edition;
    }
    // A work can only be resolved against the edition it belongs to.
    if (patch.work) {
        const work = target.edition === current.edition ? findWorkInEdition(patch.work) : undefined;
        target.work = work?.id ?? patch.work;
    }
    if ("connection" in patch) {
        target.connection = patch.connection ?? null;
    }

    if (!target.edition) return; // nothing to navigate in yet (e.g. still on the edition selection page)
    if (target.edition === current.edition && target.work === current.work && target.connection === current.connection) return;

    // Same edition and work: only the connection changes.
    if (target.edition === current.edition && target.work === current.work && target.connection !== current.connection) {
        if (target.connection === null) {
            navigateConcordanceNavigatorToDisabled();
            return;
        }
        if (navigateConcordanceNavigatorToConnection(target.connection)) return;
        // The navigator could not select it, e.g. because it is not built yet while the startup navigation is still
        // loading. Fall through: applyUrlParams queues this behind that navigation and tries again once it is done.
    }

    // applyUrlParams expects URL parameters; only non-null values are passed.
    const params = new URLSearchParams();
    if (target.edition) params.set("edition", target.edition);
    if (target.work) params.set("work", target.work);
    if (target.connection) params.set("connection", target.connection);
    await applyUrlParams(params);
}

/**
 * Entry point for the app. Sets up the header menu and layout listeners,
 * then applies the current URL parameters to initialize the edition and work.
 * @returns {Promise<void>}
 */
async function initApp() {
    await loadAppConfig();
    // Without an edition yet, the language comes from ?lang= or the backend's default preferences.
    await applyLanguage();

    // What is built from translations once (the header menu, the workspace) follows later language changes.
    onLanguageApplied((language) => {
        renderHeaderMenu();
        setConnectedWorkspaceLanguage(language);
    });
    setupHeaderMenu();
    registerLayoutListeners();
    await initConnectedWorkspace(applySyncedState);

    await applyUrlParams(paramsFromLocation(window.location.search, window.location.hash));
}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});


