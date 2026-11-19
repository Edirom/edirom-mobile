import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
    isResolvableUrl,
    parseResolverResponse,
    resolveShortLink,
    resolveScannedText
} from "../resources/js/shortLinkResolver.js";

mock.method(console, "warn", () => {});

const here = { href: "https://edirom.example.com/mobile/index.html", origin: "https://edirom.example.com", pathname: "/mobile/index.html" };
const SHORT = "https://qr.example.com/aGq";
const TARGET = "https://edirom.example.com/?edition=e1&work=w1&connection=c1";

/** A `fetch` that answers with `body` (or an error status, or a failure), and records its calls. */
function stubFetch(body, { ok = true, fail = false } = {}) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (fail) throw new TypeError("Failed to fetch");
        return { ok, status: ok ? 200 : 404, json: async () => { if (body instanceof Error) throw body; return body; } };
    };
    return { fetchImpl, calls };
}

test("only a single http(s) URL can be a short link", () => {
    assert.equal(isResolvableUrl(SHORT), true);
    assert.equal(isResolvableUrl("http://qr.example.com/aGq"), true);
    for (const text of ["www.example.org", "xmldb:exist:///db/a.xml", "https://a.example.org/x https://b.example.org/y",
        "https://a.example.org/x;https://b.example.org/y", "https://a.example.org/x[sort=a]", "", null, undefined]) {
        assert.equal(isResolvableUrl(text), false, String(text));
    }
});

test("a resolver's answer is a web page or a document, nothing else", () => {
    assert.equal(parseResolverResponse({ url: TARGET }), TARGET);
    assert.equal(parseResolverResponse({ url: ` ${TARGET} ` }), TARGET);
    assert.equal(parseResolverResponse({ url: "xmldb:exist:///db/a.xml#m1" }), "xmldb:exist:///db/a.xml#m1");
    for (const body of [null, undefined, {}, { url: "" }, { url: 5 }, { url: "javascript:alert(1)" }, { url: "data:text/html,x" },
        { url: "/relative/path" }, { url: "www.example.org" }, "https://a.example.org"]) {
        assert.equal(parseResolverResponse(body), null, JSON.stringify(body));
    }
});

test("a short link is asked for JSON, without credentials and without following redirects", async () => {
    const { fetchImpl, calls } = stubFetch({ url: TARGET });
    assert.equal(await resolveShortLink(SHORT, { fetchImpl, cache: new Map() }), TARGET);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SHORT);
    assert.equal(calls[0].options.headers.Accept, "application/json");
    assert.equal(calls[0].options.credentials, "omit");
    assert.equal(calls[0].options.redirect, "error");
    assert.ok(calls[0].options.signal);
});

test("a failed resolution is no error, but no target", async () => {
    const cases = [
        stubFetch(null, { fail: true }),                       // network error, or no CORS headers
        stubFetch({ error: "not found" }, { ok: false }),      // 404
        stubFetch(new SyntaxError("not JSON")),                // an HTML page
        stubFetch({ url: "javascript:alert(1)" }),             // an answer that must not be followed
        stubFetch({ url: SHORT })                              // the link itself
    ];
    for (const { fetchImpl } of cases) {
        assert.equal(await resolveShortLink(SHORT, { fetchImpl, cache: new Map() }), null);
    }
});

test("a request that takes too long is given up", async () => {
    const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
    });
    // Node does not keep the process alive for AbortSignal.timeout (a browser's timer does), so do it here
    const keepAlive = setTimeout(() => {}, 1000);
    try {
        assert.equal(await resolveShortLink(SHORT, { fetchImpl, timeoutMs: 20, cache: new Map() }), null);
    } finally {
        clearTimeout(keepAlive);
    }
});

test("answers are remembered, failures are not", async () => {
    const cache = new Map();
    const answered = stubFetch({ url: TARGET });
    await resolveShortLink(SHORT, { fetchImpl: answered.fetchImpl, cache });
    await resolveShortLink(SHORT, { fetchImpl: answered.fetchImpl, cache });
    assert.equal(answered.calls.length, 1);

    const failing = stubFetch(null, { fail: true });
    await resolveShortLink("https://qr.example.com/zzz", { fetchImpl: failing.fetchImpl, cache });
    await resolveShortLink("https://qr.example.com/zzz", { fetchImpl: failing.fetchImpl, cache });
    assert.equal(failing.calls.length, 2);
});

test("a scanned short link becomes its target, once", async () => {
    const { fetchImpl, calls } = stubFetch({ url: "https://edirom.example.com/?edition=e1" });
    assert.equal(await resolveScannedText(` ${SHORT}\n`, here, { fetchImpl, cache: new Map() }), "https://edirom.example.com/?edition=e1");
    assert.equal(calls.length, 1); // the target is not asked for again, even if it were an external link
});

test("a scanned text that is not an external URL is not asked for anything", async () => {
    const { fetchImpl, calls } = stubFetch({ url: TARGET });
    for (const text of [
        "xmldb:exist:///db/apps/ed1/sources/source1.xml#surface_12",
        "https://edirom.example.com/mobile/index.html?edition=e1",
        "https://edirom.example.com/?edition=e1&work=w1",
        "https://a.example.org/x https://b.example.org/y",
        "https://a.example.org/x[sort=a]",
        "www.example.org",
        "just text"
    ]) {
        assert.equal(await resolveScannedText(text, here, { fetchImpl, cache: new Map() }), text, text);
    }
    assert.equal(calls.length, 0);
});

test("a scanned external URL that is no short link stays as it is", async () => {
    const { fetchImpl } = stubFetch(null, { fail: true });
    const url = "https://en.wikipedia.org/wiki/Korngold";
    assert.equal(await resolveScannedText(url, here, { fetchImpl, cache: new Map() }), url);
});
