import { appConfig } from "./config.js";

const ISSUES_URL = "https://github.com/Edirom/Edirom-Online/issues/new/choose";

let langKeys = {};

/**
 * Loads the backend's language file (the same one Desktop's LanguageController
 * uses) and caches its keys for `getLangString`. Failures are logged and leave
 * the cache empty, so callers fall back to their default strings.
 * @param {string} lang - The language code, e.g. "de" or "en"
 * @returns {Promise<void>}
 */
export async function loadLanguageStrings(lang) {
    try {
        const url = `${appConfig.backendUrl}data/xql/getLanguageFile.xql?lang=${encodeURIComponent(lang)}&mode=json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();
        langKeys = data.keys ?? {};
    } catch (e) {
        console.warn("Failed to load language strings:", e);
    }
}

/**
 * Returns the localized string for a backend language key.
 * @param {string} key - The language key, e.g. "view.desktop.TaskBar_about"
 * @param {string} [fallback=key] - Returned when the key has no loaded string
 * @returns {string}
 */
export function getLangString(key, fallback = key) {
    return langKeys[key] ?? fallback;
}

/**
 * Escapes a string for safe insertion into HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/**
 * Extracts the fields shown on the About page from the text of a CITATION.cff
 * file. A CFF is YAML; the fields used here are top-level `key: value` lines
 * (plus the folded `abstract: >-` block and the Zenodo DOI), so — like
 * Desktop's AboutWindow — they are picked out with regular expressions.
 * Fields missing from the file are returned as `null`.
 * @param {string} text - The raw CITATION.cff content
 * @returns {Object} title, abstract, version, releaseDate, license, repoUrl, doi, commit
 */
export function parseCitation(text) {
    const scalar = (key) => text.match(new RegExp(`^${key}: (.*)`, "m"))?.[1].trim() ?? null;
    const abstractBlock = text.match(/^abstract:\s>-\n((?:\s+.*\n?)+)/m)?.[1];

    return {
        title: scalar("title"),
        abstract: abstractBlock ? abstractBlock.trim().replace(/\s+/g, " ") : null,
        version: scalar("version"),
        releaseDate: scalar("date-released"),
        license: scalar("license"),
        repoUrl: scalar("repository-code"),
        doi: text.match(/value: .*?([0-9]+\.[0-9]+\/zenodo\.[0-9]+)/)?.[1] ?? null,
        commit: scalar("commit")
    };
}

/**
 * Builds the HTML section for one parsed CITATION.cff, mirroring Desktop's
 * AboutWindow. Rows for fields missing from the file are omitted.
 * @param {Object} citation - The result of `parseCitation`
 * @returns {string} The HTML string
 */
function buildCitationHtml({ title, abstract, version, releaseDate, license, repoUrl, doi, commit }) {
    const repoPath = repoUrl?.replace(/^https?:\/\/github.com\//, "");
    const rows = [
        abstract && `<p>${escapeHtml(abstract)}</p>`,
        version && `<p>Version: ${escapeHtml(version)}</p>`,
        releaseDate && `<p>Date: ${escapeHtml(releaseDate)}</p>`,
        doi && `<p>DOI: <a target="_blank" href="https://doi.org/${escapeHtml(doi)}">${escapeHtml(doi)}</a></p>`,
        license && `<p>${escapeHtml(getLangString("view.window.about.AboutWindow_License", "License"))}: ${escapeHtml(license)}</p>`,
        repoUrl && `<p>GitHub: <a target="_blank" href="${escapeHtml(repoUrl)}">${escapeHtml(repoUrl)}</a></p>`,
        repoUrl && commit && `<p>Revision: <a target="_blank" href="${escapeHtml(repoUrl)}/tree/${escapeHtml(commit)}">${escapeHtml(commit.substring(0, 7))}...</a></p>`,
        repoUrl && `<p>Contributors: <br/>
            <a target="_blank" href="${escapeHtml(repoUrl)}/graphs/contributors">
                <img height="50px" src="https://contrib.rocks/image?repo=${escapeHtml(repoPath)}&amp;max=14&amp;columns=7" alt="Avatars of contributors to ${escapeHtml(title ?? repoPath)} in GitHub" />
            </a></p>`
    ].filter(Boolean).join("\n");

    return `<h2>About ${escapeHtml(title ?? "")}</h2><section>${rows}</section>`;
}

/**
 * Fetches a CITATION.cff and returns it as an HTML section.
 * @param {string} url - The URL of the CITATION.cff file
 * @returns {Promise<string>} The HTML string
 * @throws {Error} If the request fails
 */
async function fetchCitationHtml(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status} (${url})`);
    return buildCitationHtml(parseCitation(await response.text()));
}

/**
 * Builds and returns the About page: the CITATION.cff content of Edirom
 * Frontend and Backend (as on Desktop), rendered in an `edirom-text-viewer`.
 * @returns {Promise<HTMLElement>} The page container element
 */
export async function buildAboutPage() {
    // Mobile is served from <frontend>/mobile/, the Frontend's CFF lives in <frontend>/resources/
    const frontendCitationUrl = new URL("../resources/CITATION.cff", window.location.href).href;
    const backendCitationUrl = `${appConfig.backendUrl}resources/CITATION.cff`;

    const intro = `
        <h1>${escapeHtml(getLangString("view.window.about.AboutWindow_Title", "About Edirom Online"))}</h1>
        <section>
            <p>
                Edirom-Online is a web-based platform for the collaborative editing of complex scholarly digital editions.
                It is based on the TEI XML standard and provides a rich set of tools for the collaborative editing of texts, images, and other media.
                Edirom-Online is developed by the Edirom Project.
            </p>
            <p>
                The software consists of two main modules: the frontend and the backend.
                Information about the parts of the software can be found below.
            </p>
        </section>`;

    let body;
    try {
        const [frontend, backend] = await Promise.all([
            fetchCitationHtml(frontendCitationUrl),
            fetchCitationHtml(backendCitationUrl)
        ]);
        body = frontend + backend;
    } catch (error) {
        console.error("Error fetching CITATION.cff files:", error);
        body = `
            <section>
                <p>Error fetching content from CITATION.cff files.</p>
                <p>URL of backend CITATION.cff file: ${escapeHtml(backendCitationUrl)}</p>
                <p>URL of frontend CITATION.cff file: ${escapeHtml(frontendCitationUrl)}</p>
                <p>When encountering this or other issues persistently, please create a report on <a href="${ISSUES_URL}" target="_blank">${ISSUES_URL}</a></p>
            </section>`;
    }

    const textViewer = document.createElement("edirom-text-viewer");
    textViewer.classList.add("web-component");
    textViewer.setAttribute("layout-mode", "mobile");
    textViewer.setAttribute("html-data", intro + body);

    const page = document.createElement("div");
    page.id = "about-page";
    page.appendChild(textViewer);
    return page;
}
