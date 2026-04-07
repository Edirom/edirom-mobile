/**
 * Splits a target URI into its document path and any fragment IDs.
 * @param {string} target - A URI of the form `doc.xml` or `doc.xml#id1#id2`
 * @returns {{ doc: string, ids: string[] }} The document path and an array of IDs
 */
export function splitTargetIntoDocAndIds(target) {
    let [doc, ...ids] = target.split("#");
    return { doc, ids };
}
