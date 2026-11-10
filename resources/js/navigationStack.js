/**
 * The navigation stack of Edirom Mobile: where the user has been, so that "Back" can return there.
 * Pure data and decisions, no browser dependencies (so it also runs in Node, see ../../tests).
 *
 * The stack has one frame per page the user can go "Back" to, e.g. `[navigator, views, views]` for
 * Navigator -> Image Viewer -> Annotation Viewer. It is kept in step with the browser's history: every frame has
 * one history entry whose `state` is `{ depth, gen }` (see `historyState`), so a `popstate` event says by itself
 * which frame the browser moved to, no matter how far or in which direction (see `classifyPopstate`).
 *
 * A frame is `{ id, kind, ...captured }`:
 * - `kind` is the name of the page (`"navigator"`, `"views"`, `"edition-selection"`, `"about"`).
 * - The captured fields are what is needed to rebuild the page. They are only written when the page is left
 *   (`update`), so the frame of the page on screen has none yet. Frames hold plain data, never DOM nodes or
 *   functions.
 *
 * Three ways of moving, all done by `switchPage` (pages.js):
 * - `push`: a new page opened from this one; "Back" returns here.
 * - `reset`: a new root (another edition or work, or the navigator after a change of context). The old frames
 *   are dropped: the generation changes, so their history entries are recognised as stale.
 * - restore: "Back" went to the frame below; `truncateTo` drops the frames above it.
 *
 * A change *inside* a page (another document in the same view window, another view type, the concordance
 * connection) is not a move: the captured data is read from the live page when it is left.
 */

/**
 * A short random id for this page load. The browser keeps the history entries of a page across a reload, so
 * entries of an earlier load must not be mistaken for ones of this load.
 * @returns {string}
 */
function createLoadId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * @param {Object} [options]
 * @param {string} [options.loadId] - Identifies this page load; random if omitted (given in tests)
 */
export function createNavigationStack({ loadId = createLoadId() } = {}) {
    let frames = [];
    let generation = 0;
    let nextId = 1;

    const createFrame = (kind) => ({ id: nextId++, kind });

    const stack = {
        /** Index of the top frame, -1 while there is none. */
        get depth() {
            return frames.length - 1;
        },

        /** The frame of the page on screen, or null. */
        get top() {
            return frames[frames.length - 1] ?? null;
        },

        /** The frame below the top one, i.e. the page that "Back" returns to, or null. */
        get previous() {
            return frames[frames.length - 2] ?? null;
        },

        /** Identifies the history entries that belong to the current frames. Changes with `reset`. */
        get generation() {
            return `${loadId}.${generation}`;
        },

        at(depth) {
            return frames[depth] ?? null;
        },

        find(id) {
            return frames.find(frame => frame.id === id) ?? null;
        },

        /** Adds a frame on top: a new page opened from the current one. */
        push(kind) {
            const frame = createFrame(kind);
            frames.push(frame);
            return frame;
        },

        /** Replaces the top frame by a new one of the same depth (or adds the first one). */
        replaceTop(kind) {
            const frame = createFrame(kind);
            if (frames.length === 0) frames.push(frame);
            else frames[frames.length - 1] = frame;
            return frame;
        },

        /** Starts over with a single frame. The history entries of the old frames become stale. */
        reset(kind) {
            generation++;
            frames = [createFrame(kind)];
            return frames[0];
        },

        /** Drops the frames above `depth`, so that the frame at `depth` is the top one. */
        truncateTo(depth) {
            if (depth < frames.length - 1) frames = frames.slice(0, Math.max(0, depth + 1));
        },

        /**
         * Stores what was captured of a page in its frame. `id` and `kind` cannot be overwritten.
         * @returns {boolean} false if the frame is not on the stack any more
         */
        update(id, captured) {
            const frame = stack.find(id);
            if (!frame || !captured) return false;
            const { id: ignoredId, kind: ignoredKind, ...data } = captured;
            Object.assign(frame, data);
            return true;
        },

        /**
         * The `state` for the history entry of the top frame (plain data, so the browser can store it).
         * @param {string} [page] - The page name, for people looking at `history.state` in the dev tools
         * @returns {{depth: number, gen: string, page?: string}}
         */
        historyState(page) {
            return { depth: stack.depth, gen: stack.generation, page };
        },

        /**
         * Says what a `popstate` event means, from the `state` of the history entry the browser moved to.
         * - `same`: the entry of the frame on screen (also what our own correction of the history ends in)
         * - `back`: the entry of a frame below the top one (`depth` is that frame)
         * - `forward`: the entry of a frame that was left by going back and is not on the stack any more
         * - `guard`: no state: the entry that the page was loaded with, below the first frame
         * - `stale`: a state of an earlier generation or page load, or a state this app did not write
         * @param {*} state - `event.state`
         * @returns {{type: "same"|"back"|"forward"|"guard"|"stale", depth?: number}}
         */
        classifyPopstate(state) {
            if (state === null || state === undefined) return { type: "guard" };
            if (state.gen !== stack.generation || !Number.isInteger(state.depth) || state.depth < 0) {
                return { type: "stale" };
            }
            if (state.depth === stack.depth) return { type: "same", depth: state.depth };
            if (state.depth > stack.depth) return { type: "forward", depth: state.depth };
            return { type: "back", depth: state.depth };
        }
    };

    return stack;
}
