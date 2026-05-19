/**
 * Global content-container loading overlay.
 *
 * A reference counter (`loadingDepth`) is used so that multiple concurrent
 * async operations can call showContentLoading / hideContentLoading independently
 * without prematurely dismissing the overlay.
 *
 * The overlay only becomes visible if loading is still in progress after a
 * 1-second delay. Operations that complete within that window never cause the
 * overlay to flash on screen.
 *
 * Generation counter (token): showContentLoading() returns an integer token.
 * Pass it to hideContentLoading(token) so that stale hide-calls from aborted
 * operations (after a resetContentLoadingState()) are silently ignored.
 *
 * AbortController: each content context gets a fresh AbortController. All fetch
 * calls in api.js use getContentSignal() to receive the current signal. Calling
 * resetContentLoadingState() aborts the previous controller, cancelling all
 * in-flight fetches for the old context.
 *
 * The overlay element is appended once to <body> (not inside #content-container)
 * so it is never wiped by switchPage()'s innerHTML = "". Its position and size
 * are kept in sync with #content-container via CSS custom properties that
 * layout.js already maintains on :root.
 */

/** @type {number} Number of in-flight loading operations in the current context */
let loadingDepth = 0;

/** @type {ReturnType<typeof setTimeout>|null} Timer that will show the overlay after the delay */
let showTimer = null;

/** @type {boolean} Whether the overlay is currently visible in the DOM */
let overlayVisible = false;

/**
 * Incremented each time resetContentLoadingState() is called. Returned by
 * showContentLoading() and checked by hideContentLoading() to discard stale
 * hide-calls from aborted operations.
 * @type {number}
 */
let loadingGeneration = 0;

/** @type {AbortController} Controller whose signal is passed to every fetch in api.js */
let contentAbortController = new AbortController();

const LOADING_DELAY_MS = 350;

/**
 * Returns the overlay element, creating and appending it to <body> on first call.
 * @returns {HTMLElement}
 */
function getOverlayElement() {
    let overlay = document.getElementById("content-loading-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "content-loading-overlay";

        const icon = document.createElement("edirom-icon");
        icon.setAttribute("name", "sync");
        icon.setAttribute("size", "3.5rem");
        overlay.appendChild(icon);

        document.body.appendChild(overlay);
    }
    return overlay;
}

/**
 * Returns the AbortSignal for the current content context. Called by api.js
 * fetch helpers at the moment a fetch starts so it always reflects the signal
 * belonging to the currently active context.
 * @returns {AbortSignal}
 */
export function getContentSignal() {
    return contentAbortController.signal;
}

/**
 * Cancels all in-flight fetches for the current context and resets the loading
 * overlay state. Call this at the top of every entry point that starts a new
 * content context (showNavigator, createViewWindow, updateCurrentView).
 *
 * The generation counter is incremented so any hideContentLoading(token) calls
 * still pending from the old context are silently ignored.
 */
export function resetContentLoadingState() {
    // Abort all in-flight fetches for the old context and create a fresh controller
    contentAbortController.abort();
    contentAbortController = new AbortController();

    // Increment generation: old hideContentLoading(token) calls become no-ops
    loadingGeneration++;

    // Reset the reference counter and cancel any pending show-timer
    loadingDepth = 0;
    if (showTimer !== null) {
        clearTimeout(showTimer);
        showTimer = null;
    }

    // Hide the overlay if it is currently visible
    if (overlayVisible) {
        const overlay = document.getElementById("content-loading-overlay");
        overlay?.classList.remove("visible");
        overlayVisible = false;
    }
}

/**
 * Signals that a loading operation has started. Increments the reference counter.
 * When the counter transitions from 0 to 1 a timer is started; the overlay only
 * becomes visible if the counter is still above 0 when the timer fires (i.e. the
 * operation takes longer than LOADING_DELAY_MS).
 * @returns {number} A token identifying the current loading generation. Pass this
 *   to hideContentLoading() to guard against stale hide-calls after a context reset.
 */
export function showContentLoading() {
    loadingDepth++;
    if (loadingDepth === 1) {
        showTimer = setTimeout(() => {
            showTimer = null;
            if (loadingDepth > 0) {
                getOverlayElement().classList.add("visible");
                overlayVisible = true;
            }
        }, LOADING_DELAY_MS);
    }
    return loadingGeneration;
}

/**
 * Signals that a loading operation has finished. Decrements the reference counter.
 * When the counter reaches 0 the pending timer is cancelled (if the overlay has not
 * yet appeared) or the overlay is hidden (if it was already shown).
 * Safe to call more times than showContentLoading — will not go below 0.
 * @param {number} [token] - The value returned by the matching showContentLoading().
 *   If provided and it no longer matches the current generation (i.e. a context
 *   reset happened in the meantime), this call is a no-op.
 */
export function hideContentLoading(token) {
    if (token !== undefined && token !== loadingGeneration) return;
    if (loadingDepth > 0) {
        loadingDepth--;
    }
    if (loadingDepth === 0) {
        if (showTimer !== null) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        if (overlayVisible) {
            const overlay = document.getElementById("content-loading-overlay");
            overlay?.classList.remove("visible");
            overlayVisible = false;
        }
    }
}

