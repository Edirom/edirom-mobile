/**
 * Pure helpers for the image server settings (`image_server`, `image_prefix`), mirroring Edirom-Frontend's
 * `ImageViewer.buildTileSource`. No browser dependencies, so they can also run in Node (see ../../tests).
 */

/**
 * Resolves the `image_prefix` preference against the base URL of the Frontend. The preference is written for
 * the Frontend page (e.g. `../../../digilib/Scaler/`), but Mobile is served one directory deeper, so a relative
 * prefix has to be rebased. Absolute prefixes and empty prefixes are returned unchanged.
 * @param {string} prefix - The `image_prefix` preference
 * @param {string} baseUrl - The URL of the Frontend root, with a trailing slash
 * @returns {string} The prefix as an absolute URL
 */
export function resolveImagePrefix(prefix, baseUrl) {
    if (!prefix || !baseUrl) return prefix ?? "";
    return new URL(prefix, baseUrl).href;
}

/**
 * Builds the tile source descriptor of one page for the image viewer: a digilib descriptor
 * (`image_server=digilib`, relative paths only), or an IIIF level2 descriptor otherwise. Absolute `http(s)` paths
 * always take the IIIF branch, because they point at some other image server, and digilib's query syntax breaks
 * those. Without an `imagePrefix` (preferences not loaded), relative paths are passed through as plain strings.
 * @param {string} path - The path of the page image, as returned by getPages
 * @param {number|string} width - The width of the image in pixels
 * @param {number|string} height - The height of the image in pixels
 * @param {Object} [settings]
 * @param {string} [settings.imageServer] - The `image_server` preference
 * @param {string} [settings.imagePrefix] - The `image_prefix` preference, already resolved to an absolute URL
 * @returns {Object|string} The tile source descriptor
 */
export function buildTileSource(path, width, height, { imageServer, imagePrefix } = {}) {
    if (!path) return path;
    const isAbsolute = path.startsWith("http");

    if (!isAbsolute && imagePrefix == null) return path;

    if (imageServer === "digilib" && !isAbsolute) {
        return {
            type: "digilib",
            url: imagePrefix + path,
            width: Number(width),
            height: Number(height)
        };
    }

    return {
        "@context": "http://iiif.io/api/image/2/context.json",
        "@id": isAbsolute ? path : imagePrefix + path.replace(/\//g, "!"),
        "height": Number(height),
        "width": Number(width),
        "profile": ["http://iiif.io/api/image/2/level2.json"],
        "protocol": "http://iiif.io/api/image",
        "tiles": [{ "scaleFactors": [1, 2, 4, 8, 16, 32], "width": 1024 }]
    };
}
