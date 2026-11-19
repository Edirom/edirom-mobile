/**
 * Decides how far the app has to be moved to reach the edition, work and connection that a URL asks for (the
 * start page, a link to Mobile itself such as a scanned code, a state of the connected workspace). The point is
 * that nothing is reloaded that is open already: a request for the edition and work that are open leaves the app as
 * it is, or at most selects the connection.
 * Pure, no browser dependencies (so it also runs in Node, see ../../tests).
 */

/**
 * Whether `identifier` names `item`. Callers identify editions and works differently: Mobile by the short `id`,
 * Desktop by the full `doc` URI (see `initEdition`), and both are accepted.
 * @param {{id?: string, doc?: string}|null|undefined} item - The current edition or work
 * @param {string|null} identifier - What the URL says
 * @returns {boolean}
 */
function isNamedBy(item, identifier) {
    return !!identifier && (item?.id === identifier || item?.doc === identifier);
}

/**
 * @typedef {"none"|"connection"|"work"|"edition"} ContextPlan
 * - `"none"`: edition and work are open already and no connection is asked for, so there is nothing to do.
 * - `"connection"`: edition and work are open already, only the connection is selected.
 * - `"work"`: the edition is open already, another work is initialized.
 * - `"edition"`: everything is initialized from the edition on.
 */

/**
 * @param {{editionId: string|null, workId: string|null, connectionId: string|null}} requested - Already normalized to
 *   follow the `edition > work > connection` hierarchy
 * @param {{edition?: Object|null, work?: Object|null, hasWorks?: boolean}} current - The open edition and work, and
 *   whether the works of the edition are loaded
 * @returns {ContextPlan}
 */
export function planContextNavigation({ editionId, workId, connectionId }, { edition, work, hasWorks = false }) {
    if (!isNamedBy(edition, editionId) || !workId) return "edition";
    if (isNamedBy(work, workId)) return connectionId ? "connection" : "none";
    return hasWorks ? "work" : "edition";
}
