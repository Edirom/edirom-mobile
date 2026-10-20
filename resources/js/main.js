import { appState, setAppState, loadAppConfig } from "./config.js";
import { getAllEditions, getWorks } from "./api.js";
import { setupHeaderMenu, setWorkTitle } from "./header.js";
import { registerLayoutListeners } from "./layout.js";
import { switchPage, buildEditionSelectionPage, showNavigator } from "./pages.js";
import { initConcordanceNavigator, navigateConcordanceNavigatorToConnection, navigateConcordanceNavigatorToDisabled } from "./concordanceNavigator.js";
import { initConnectedWorkspace, updateConnectedWorkspaceInviteUrl, applyWorkspaceSession, notifyStateChanged, getSyncedState } from "./connected-workspace.js";
import { showContentLoading, hideContentLoading } from "./loading.js";
import { loadLanguageStrings } from "./about.js";
import { resetNavigatorData } from "./navigator.js";


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

    if (foundEditionId == "") {
        // Edition nicht gefunden, öffne Editionsauswahlseite.
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

    const editionData = appState.allEditions.find((edition) => edition.id === foundEditionId);

    if (!editionData) {
        console.error("Resolved edition ID is missing from cache", { foundEditionId });
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

    setAppState({ edition: editionData });

    if (!appState.edition.doc) {
        console.error("Edition data is incomplete", appState.edition);
        switchPage("edition-selection", buildEditionSelectionPage());
        return;
    }

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
    console.log("Initializing work");
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

    console.log("Set work to", appState.work);
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

/**
 * Applies a set of URL search parameters to initialize the app in the
 * corresponding state. Enforces the `edition > work > connection` hierarchy
 * (work requires edition; connection requires both) and delegates to
 * `initEdition`. This is the single point where URL parameters are translated
 * into app state, used both on startup and when a self-link is activated.
 * @param {URLSearchParams} urlParams - The parameters to apply
 * @returns {Promise<void>}
 */
export async function applyUrlParams(urlParams) {
    const editionId = normalizeParam(urlParams.get("edition"));
    let workId = normalizeParam(urlParams.get("work"));
    let connectionId = normalizeParam(urlParams.get("connection"));
    const workspaceSession = normalizeParam(urlParams.get("workspaceSession"));

    // Enforce URL parameter hierarchy without failing startup.
    // work requires edition, and connection requires both edition and work.
    if (!editionId) {
        workId = null;
        connectionId = null;
    }
    else if (!workId) {
        connectionId = null;
    }

    // Fast path: same edition + same work + new connection.
    // Reuse the existing concordance navigator element — nothing is rebuilt and the
    // scanner stays paused so it can resume instantly on next open.
    if (editionId && editionId === appState.edition?.id &&
        workId && workId === appState.work?.id &&
        connectionId) {
        const navigated = navigateConcordanceNavigatorToConnection(connectionId);
        if (navigated) {
            updateConnectedWorkspaceInviteUrl();
            if (workspaceSession) applyWorkspaceSession(workspaceSession);
            return;
        }
        // Connection not found in current concordance data — fall through to full reinitialisation.
    }

    // Medium path: same edition, different work.
    // Skip initEdition() and its backend availability checks; call initWork() directly.
    // Navigator data reset and rebuild are handled inside initWork().
    if (editionId && editionId === appState.edition?.id &&
        workId && workId !== appState.work?.id &&
        appState.worksInEdition?.length > 0) {
        await initWork(workId, connectionId);
        updateConnectedWorkspaceInviteUrl();
        if (workspaceSession) applyWorkspaceSession(workspaceSession);
        return;
    }

    await initEdition({
        editionId,
        workId,
        connectionId
    });
    updateConnectedWorkspaceInviteUrl();
    if (workspaceSession) applyWorkspaceSession(workspaceSession);
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
        // Connection not found in the current concordance data — fall through to a full re-init.
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
    console.log("Initializing Edirom Mobile App");

    await loadAppConfig();
    await loadLanguageStrings(appState.language);

    setupHeaderMenu();
    registerLayoutListeners();
    await initConnectedWorkspace(applySyncedState);

    await applyUrlParams(new URLSearchParams(window.location.search));
}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});


