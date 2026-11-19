import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUri, isSelfLink } from "../resources/js/targets.js";

/** Where Mobile runs: <frontend>/mobile/index.html */
function at(href) {
    const url = new URL(href);
    return { href: url.href, origin: url.origin, pathname: url.pathname };
}
const here = at("https://edirom.example.com/mobile/index.html?edition=e1");

test("a document URI is a doc, wherever Mobile runs", () => {
    assert.equal(classifyUri("xmldb:exist:///db/apps/ed1/sources/source1.xml#surface_12", here), "doc");
});

test("Mobile's own page and Edirom-Frontend's root are self-links", () => {
    for (const uri of [
        "https://edirom.example.com/mobile/index.html?edition=e1&work=w1&connection=c1",
        "https://edirom.example.com/mobile/?edition=e1",
        "https://edirom.example.com/mobile?edition=e1",
        "https://edirom.example.com/?edition=e1&work=w1&connection=c1",
        "https://edirom.example.com/index.html?edition=e1",
        "https://edirom.example.com/?ui=mobile&edition=e1"
    ]) {
        assert.equal(classifyUri(uri, here), "selfLink", uri);
    }
});

test("another origin, another path or the Desktop UI is not a self-link", () => {
    for (const uri of [
        "https://other.example.com/mobile/index.html",
        "http://edirom.example.com/mobile/index.html",
        "https://edirom.example.com:8443/?edition=e1",
        "https://edirom.example.com/mobile/other.html",
        "https://edirom.example.com/other/",
        "https://edirom.example.com/?ui=desktop&edition=e1",
        "https://edirom.example.com/mobile/index.html?ui=desktop"
    ]) {
        assert.equal(classifyUri(uri, here), "externalLink", uri);
    }
});

test("short links and other web addresses are external links", () => {
    assert.equal(classifyUri("https://qr.example.com/aGq", here), "externalLink");
    assert.equal(classifyUri("https://en.wikipedia.org/wiki/Korngold", here), "externalLink");
    assert.equal(classifyUri("www.example.org/page", here), "externalLink");
});

test("anything else is unknown", () => {
    for (const uri of ["javascript:alert(1)", "mailto:a@example.org", "ftp://example.org/", "httpx://example.org/", "just text", ""]) {
        assert.equal(classifyUri(uri, here), "unknown", uri);
    }
});

test("Edirom-Frontend's root is found from where Mobile runs", () => {
    // Mobile served at the root of its host, with the Frontend one level up being the root itself
    const root = at("https://m.example.com/index.html");
    assert.equal(isSelfLink(new URL("https://m.example.com/?edition=e1"), root), true);
    // Mobile in a sub-directory of a deployment
    const nested = at("https://example.com/edirom/mobile/");
    assert.equal(isSelfLink(new URL("https://example.com/edirom/?edition=e1"), nested), true);
    assert.equal(isSelfLink(new URL("https://example.com/?edition=e1"), nested), false);
});
