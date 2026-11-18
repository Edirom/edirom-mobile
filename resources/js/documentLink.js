/**
 * The `uri` URL parameter: a link to a document (`xmldb:exist://…/doc.xml`, optionally with a `#xml:id`) that is
 * opened at startup. Edirom-Frontend's Desktop reads the same parameter (Application.js), which lets the Desktop ⇄
 * Mobile switch carry the document the user is looking at. The viewer is not part of the parameter: it follows
 * from the type of the id (see viewSelection.js).
 * Pure helpers, no browser dependencies (so they also run in Node, see ../../tests).
 */

import { parseTargets, isDocumentUri } from "./targets.js";

/**
 * The URL parameters of a page, with the hash merged into `uri` like Edirom-Frontend does: `?uri=doc.xml#id` has
 * its id in the hash, not in the query. A `uri` that has an id already (`%23` in the query) is left alone.
 * @param {string} search - `location.search`
 * @param {string} [hash=""] - `location.hash`
 * @returns {URLSearchParams}
 */
export function paramsFromLocation(search, hash = "") {
    const params = new URLSearchParams(search);
    const uri = params.get("uri");
    if (uri && hash.length > 1 && !uri.includes("#")) {
        params.set("uri", uri + hash);
    }
    return params;
}

/**
 * The document that the `uri` parameter asks for.
 *
 * Mobile shows one document at a time, so of several URIs (separated by whitespace or `;`, as Desktop accepts
 * them) only the first is used. Anything that is not a document in the database is ignored: the parameter does not
 * open web pages.
 * @param {URLSearchParams} urlParams
 * @returns {string|null} The document URI with its optional `#id` fragments, or null if there is none
 */
export function readDocumentLink(urlParams) {
    const uri = urlParams.get("uri");
    if (!uri) return null;
    const first = parseTargets(uri.trim())[0]?.target;
    return first && isDocumentUri(first) ? first : null;
}
