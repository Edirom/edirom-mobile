import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveImagePrefix, buildTileSource } from "../resources/js/imageServer.js";

const DIGILIB = { imageServer: "digilib", imagePrefix: "http://host/digilib/Scaler/" };
const IIIF = { imageServer: "openseadragon", imagePrefix: "http://host/iiif/" };

test("resolveImagePrefix rebases a relative prefix against the Frontend root", () => {
    assert.equal(
        resolveImagePrefix("../../../digilib/Scaler/", "http://host/exist/apps/Edirom-Online/"),
        "http://host/digilib/Scaler/"
    );
});

test("resolveImagePrefix keeps absolute and empty prefixes", () => {
    assert.equal(resolveImagePrefix("https://iiif.test/img/", "http://host/app/"), "https://iiif.test/img/");
    assert.equal(resolveImagePrefix("", "http://host/app/"), "");
    assert.equal(resolveImagePrefix(undefined, "http://host/app/"), "");
});

test("buildTileSource builds a digilib descriptor for relative paths", () => {
    assert.deepEqual(buildTileSource("a/b.jpg", "100", "200", DIGILIB), {
        type: "digilib",
        url: "http://host/digilib/Scaler/a/b.jpg",
        width: 100,
        height: 200
    });
});

test("buildTileSource builds an IIIF descriptor with the prefix and escaped slashes", () => {
    const source = buildTileSource("a/b.jpg", "100", "200", IIIF);
    assert.equal(source["@id"], "http://host/iiif/a!b.jpg");
    assert.equal(source.width, 100);
    assert.equal(source.height, 200);
    assert.equal(source.protocol, "http://iiif.io/api/image");
    assert.deepEqual(source.tiles, [{ scaleFactors: [1, 2, 4, 8, 16, 32], width: 1024 }]);
});

test("buildTileSource sends absolute paths to the IIIF branch, even for digilib", () => {
    const source = buildTileSource("https://iiif.test/image/1", 10, 20, DIGILIB);
    assert.equal(source["@id"], "https://iiif.test/image/1");
    assert.equal(source.type, undefined);
});

test("buildTileSource passes relative paths through without an image prefix", () => {
    assert.equal(buildTileSource("a/b.jpg", 100, 200, {}), "a/b.jpg");
    assert.equal(buildTileSource("a/b.jpg", 100, 200), "a/b.jpg");
});

test("buildTileSource still builds IIIF for absolute paths without preferences", () => {
    assert.equal(buildTileSource("http://x.test/i", 1, 2)["@id"], "http://x.test/i");
});

test("buildTileSource returns a missing path unchanged", () => {
    assert.equal(buildTileSource(undefined, 1, 2, DIGILIB), undefined);
});
