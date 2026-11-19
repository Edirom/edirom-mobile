/**
 * Resolves the short links that QR codes carry (e.g. `https://qr.example.com/aGq`) to the URL they stand for.
 * The contract is generic, there is nothing about a particular host in here: a GET of the scanned URL with
 * `Accept: application/json` is answered with `200 {"url": "<target>"}` by a resolver. Which scanned URLs are
 * fetched at all is the edition's decision: it is the `qr_regex` preference, which the scanner applies before
 * a code reaches this module.
 *
 * No browser dependencies besides `fetch`/`AbortSignal`, which can be injected, so it also runs in Node (see
 * ../../tests).
 */
import { classifyUri, isDocumentUri } from "./targets.js";

export const RESOLVER_TIMEOUT_MS = 5000;

/** Resolved URLs by scanned URL, for the lifetime of the page. */
const defaultCache = new Map();

/**
 * Whether a scanned text is one URL that can be asked for its target: a single `http(s)://` URL. A list of
 * targets (separated by spaces or semicolons) or one with a config block (`[…]`) is not a short link, and a
 * scheme-less `www.` address cannot be fetched.
 * @param {string} text
 * @returns {boolean}
 */
export function isResolvableUrl(text) {
    return typeof text === "string" && /^https?:\/\/[^\s;[\]]+$/i.test(text);
}

/**
 * Reads a resolver's answer. Only a web page (`http(s):`) or a document (`xmldb:`) is accepted as target, because
 * it is navigated to (a `javascript:` URL, for example, must never be).
 * @param {any} body - The parsed JSON of the response
 * @returns {string|null} The target URL, or null if the answer is not a valid one
 */
export function parseResolverResponse(body) {
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (isDocumentUri(url)) return url;
    if (!isResolvableUrl(url)) return null;
    try {
        new URL(url);
        return url;
    } catch {
        return null;
    }
}

/**
 * The strategies to find a short link's target, tried in this order until one answers. Each is
 * `async (url, { fetchImpl, signal }) => string|null` and returns null if it cannot tell. More can be added
 * (for example another header or a backend proxy) without changing the callers.
 */
const strategies = [
    /** `GET <url>` with `Accept: application/json`, answered with `{"url": "<target>"}` (needs CORS). */
    async function jsonResolver(url, { fetchImpl, signal }) {
        const response = await fetchImpl(url, {
            headers: { Accept: "application/json" },
            credentials: "omit",
            redirect: "error",
            signal
        });
        if (!response.ok) return null;
        return parseResolverResponse(await response.json());
    }
];

/**
 * Asks for the target of a short link. Any failure (no network, no CORS, an error status, an answer that is not
 * JSON or has no valid `url`, a timeout) means that the URL is not a short link: null, and never an error,
 * because an ordinary external URL is not one either.
 * @param {string} url - A URL accepted by `isResolvableUrl`
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Defaults to the global `fetch`
 * @param {number} [options.timeoutMs] - Defaults to `RESOLVER_TIMEOUT_MS`
 * @param {Map<string, string|null>} [options.cache] - Defaults to a page-wide cache
 * @returns {Promise<string|null>} The target URL, or null
 */
export async function resolveShortLink(url, { fetchImpl = globalThis.fetch, timeoutMs = RESOLVER_TIMEOUT_MS, cache = defaultCache } = {}) {
    if (cache.has(url)) return cache.get(url);

    let resolved = null;
    for (const strategy of strategies) {
        try {
            resolved = await strategy(url, { fetchImpl, signal: AbortSignal.timeout(timeoutMs) });
        } catch (error) {
            console.warn("Short link could not be resolved, using it as it is:", url, error?.message ?? error);
        }
        if (resolved) break;
    }
    // A target that is the link itself is no resolution
    if (resolved === url) resolved = null;
    // Only answers are remembered, so that a failed request (e.g. offline) is tried again on the next scan
    if (resolved) cache.set(url, resolved);
    return resolved;
}

/**
 * The text to open for a scanned code. A single URL that is neither a document nor Mobile itself is asked for
 * its target once; the target is not asked again, so there are no loops.
 * @param {string} text - The scanned text
 * @param {{href: string, origin: string, pathname: string}} here - Where Mobile runs (`window.location`)
 * @param {Object} [options] - See `resolveShortLink`
 * @returns {Promise<string>} The target if the text is a short link, the text itself otherwise
 */
export async function resolveScannedText(text, here, options) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!isResolvableUrl(trimmed) || classifyUri(trimmed, here) !== "externalLink") return text;
    return (await resolveShortLink(trimmed, options)) ?? trimmed;
}
