import { getMeasurePage, getMeasuresOnPage, getAnnotationsOnPage } from "./api.js";
import { loadLinks } from "./linkController.js";

// How long a fresh viewer may take to draw its first tile before the initial page/zone is applied anyway.
const IMAGE_READY_TIMEOUT_MS = 5000;

// Annotation category -> host-supplied icon markup, the same as Edirom-Frontend's ImageViewer.js: the viewer
// has no icon knowledge and inserts whatever zone.iconHtml it is given.
const ANNOTATION_ICON_MARKUP = {
    "annotation.category.beschreibung": '<edirom-icon name="description"></edirom-icon>',
    "annotation.category.rasurTektur": '<edirom-icon name="ink_eraser"></edirom-icon>'
};

/**
 * The data an image view shares between all of its viewers for one document: the pages (every viewer gets the
 * same tile sources, so a page has the same number in all of them), the zones (navigation targets and
 * overlays) and the per-page caches. When a page's measures or annotations arrive, every viewer gets them.
 *
 * Navigation zones (keyed by the raw measure id or a host key, without a `type`, so never drawn) are kept apart
 * from overlays (measure numbers, annotation badges), which carry a `type` and are only drawn while that type
 * is in a viewer's visible-types.
 *
 * @param {{ showMeasures: boolean, showAnnotations: boolean }} overlays - Which overlays are switched on
 */
export function createImageDocument(overlays) {
    const imageDoc = {
        doc: "",
        edition: "",
        generation: 0,               // incremented per document, so late responses of an old one are dropped
        pages: [],                   // getPages response (all pages)
        pageIdToIndex: new Map(),    // pageId → 1-based page number in the viewers
        tileSources: [],
        navZones: {},                // key → { page, ulx, uly, lrx, lry }
        overlayZones: {},            // zone key → zone with `type` "measure" or "annotation"
        measurePageIdCache: new Map(), // measure xml:id → pageId
        pageMeasuresCache: new Map(),  // pageId → Promise of getMeasuresOnPage response
        pageAnnotationsCache: new Map(), // pageId → Promise of getAnnotationsOnPage response
        overlays,
        sessions: new Set(),

        /** Starts a new document: drops all zones and caches. */
        reset(doc, edition, pages, tileSources) {
            this.doc = doc;
            this.edition = edition;
            this.generation++;
            this.pages = pages;
            this.pageIdToIndex = new Map(pages.map((page, index) => [page.id, index + 1]));
            this.tileSources = tileSources;
            this.navZones = {};
            this.overlayZones = {};
            this.measurePageIdCache = new Map();
            this.pageMeasuresCache = new Map();
            this.pageAnnotationsCache = new Map();
        },

        /** Writes the zones to every viewer. */
        pushZonesToAll() {
            for (const session of this.sessions) session.pushZones();
        },

        /**
         * Fetches the measures on a page once (concurrent callers share the request) and registers them as
         * navigation targets and, for the measure numbers, as overlay zones.
         */
        fetchPageMeasures(pageId) {
            if (!this.pageMeasuresCache.has(pageId)) {
                this.pageMeasuresCache.set(pageId, loadPageMeasures(this, pageId));
            }
            return this.pageMeasuresCache.get(pageId);
        },

        /** Fetches the annotations on a page once and registers one badge zone per annotated region. */
        fetchPageAnnotations(pageId) {
            if (!this.pageAnnotationsCache.has(pageId)) {
                this.pageAnnotationsCache.set(pageId, loadPageAnnotations(this, pageId));
            }
            return this.pageAnnotationsCache.get(pageId);
        },

        /** Makes sure a measure's zone is known, loading its page's measures if necessary. */
        async ensureZoneLoaded(measureId) {
            if (this.navZones[measureId]) return;

            // Bulk-fetch via a cached pageId
            const cachedPageId = this.measurePageIdCache.get(measureId);
            if (cachedPageId) {
                await this.fetchPageMeasures(cachedPageId);
                return;
            }

            // Fallback: single getMeasurePage, then bulk-cache its siblings
            const generation = this.generation;
            const data = await getMeasurePage(this.doc, this.edition, measureId);
            if (generation !== this.generation) return;
            if (data && data.length > 0 && data[0].pageId) {
                this.measurePageIdCache.set(measureId, data[0].pageId);
                await this.fetchPageMeasures(data[0].pageId);
            }
        },

        /** Loads the overlay data of a page, for the overlays that are switched on. */
        async loadOverlays(pageId) {
            if (!pageId) return;
            const loads = [];
            if (this.overlays.showMeasures) loads.push(this.fetchPageMeasures(pageId));
            if (this.overlays.showAnnotations) loads.push(this.fetchPageAnnotations(pageId));
            await Promise.all(loads);
        },

        pageIdAt(pageNumber) {
            return this.pages[pageNumber - 1]?.id;
        }
    };
    return imageDoc;
}

async function loadPageMeasures(imageDoc, pageId) {
    const generation = imageDoc.generation;
    const result = (await getMeasuresOnPage(imageDoc.doc, pageId, imageDoc.edition)) || [];
    if (generation !== imageDoc.generation) return result;
    const page = imageDoc.pageIdToIndex.get(pageId);
    for (const m of result) {
        imageDoc.measurePageIdCache.set(m.id, pageId);
        const rect = { ulx: Number(m.ulx), uly: Number(m.uly), lrx: Number(m.lrx), lry: Number(m.lry) };
        imageDoc.navZones[m.id] = { page, ...rect };

        // One number per zone: part-wise sources list several measures (one per part) for the same zone.
        if (m.name) {
            const key = `measure:${m.zoneId ?? m.id}`;
            imageDoc.overlayZones[key] = {
                type: "measure", page, ...rect,
                containerClass: "measure", innerClass: "measureInner",
                label: String(m.name), group: key
            };
        }
    }
    imageDoc.pushZonesToAll();
    return result;
}

async function loadPageAnnotations(imageDoc, pageId) {
    const generation = imageDoc.generation;
    const annotations = (await getAnnotationsOnPage(imageDoc.doc, pageId, imageDoc.edition)) || [];
    if (generation !== imageDoc.generation) return annotations;
    const page = imageDoc.pageIdToIndex.get(pageId);
    for (const annotation of annotations) {
        const categories = (annotation.categories || "").trim();
        const priority = (annotation.priority || "").trim();
        const iconHtml = categories.split(/\s+/).map(c => ANNOTATION_ICON_MARKUP[c]).find(Boolean) || "";
        for (const shape of annotation.plist || []) {
            const rect = [shape.ulx, shape.uly, shape.lrx, shape.lry];
            if (rect.some(v => v == null || v === "")) continue;
            // Annotations on the same region share a container, so their badges stack.
            const group = `annotation:${shape.id}`;
            imageDoc.overlayZones[`${group}:${annotation.id}`] = {
                type: "annotation", page,
                ulx: Number(shape.ulx), uly: Number(shape.uly), lrx: Number(shape.lrx), lry: Number(shape.lry),
                containerClass: "annotation",
                innerClass: ["annotIcon", categories, priority, shape.type].filter(Boolean).join(" "),
                iconHtml, group,
                // zone-click reports this; it is the URI loadLinks needs to open the annotation.
                dataId: annotation.uri,
                filters: [categories, priority].filter(Boolean).join(" ")
            };
        }
    }
    imageDoc.pushZonesToAll();
    return annotations;
}

/**
 * Drives one `<edirom-image-viewer>` on the data of an image document: pages, zone jumps, overlays.
 * @param {HTMLElement} viewer - The edirom-image-viewer element
 * @param {ReturnType<typeof createImageDocument>} imageDoc
 */
export function createViewerSession(viewer, imageDoc) {
    // The key last written to the viewer's `zone`. The viewer re-applies its active zone on every zones-data
    // push (and never clears it), so this key is left out of pushes unless it is the one being navigated to.
    let activeZoneKey = null;
    let pageNumber = 1;              // 1-based page the viewer currently shows
    let zoneNonce = 0;

    // Counts navigations (page steps, zone jumps). A zone jump that waits for the viewer or for data applies
    // only if no other navigation came in meanwhile.
    let navigationId = 0;

    // Resolved once the viewer has loaded its first tile (or after a timeout, should `image-ready` not come). A
    // zone can only be applied to an open image, and the viewer is created asynchronously after `tilesources`.
    // A page needs no waiting: the viewer opens on the page requested before it exists.
    let imageReady = Promise.resolve();
    let cancelImageReady = null;
    function resetImageReady() {
        cancelImageReady?.();
        imageReady = new Promise(resolve => {
            const done = () => {
                clearTimeout(timer);
                viewer.removeEventListener("image-ready", done);
                cancelImageReady = null;
                resolve();
            };
            const timer = setTimeout(done, IMAGE_READY_TIMEOUT_MS);
            viewer.addEventListener("image-ready", done);
            cancelImageReady = done;
        });
    }

    // The shown page is tracked in every view mode, because the overlays belong to it.
    const onPageChanged = (event) => {
        pageNumber = event.detail.pageNumber;
        imageDoc.loadOverlays(imageDoc.pageIdAt(pageNumber));
    };
    // Tapping an annotation badge opens the annotation (the viewer's zone-click does not bubble).
    const onZoneClick = (event) => {
        const { type, id } = event.detail;
        if (type === "annotation" && id) {
            loadLinks(id, { behaviour: "updateViewOrCreateViewWindow" });
        }
    };
    viewer.addEventListener("page-changed", onPageChanged);
    viewer.addEventListener("zone-click", onZoneClick);

    const session = {
        viewer,

        get pageNumber() {
            return pageNumber;
        },

        get activeZoneKey() {
            return activeZoneKey;
        },

        /** Gives the viewer the document's pages (re-initialises it). */
        setTileSources() {
            pageNumber = 1;
            activeZoneKey = null;
            // Clear the viewer's zones before it is rebuilt, so that its old active zone cannot be applied to the
            // new document.
            viewer.setAttribute("zones-data", "{}");
            resetImageReady();
            viewer.setAttribute("tilesources", JSON.stringify(imageDoc.tileSources));
        },

        /**
         * Writes zones-data from the navigation and overlay zones. The key last navigated to is left out (see
         * activeZoneKey) unless it is `targetKey`, which is about to be navigated to.
         */
        pushZones(targetKey = null) {
            const zones = {};
            for (const [key, zone] of Object.entries(imageDoc.navZones)) {
                if (key === activeZoneKey && key !== targetKey) continue;
                zones[key] = zone;
            }
            Object.assign(zones, imageDoc.overlayZones);
            viewer.setAttribute("zones-data", JSON.stringify(zones));
        },

        /** Counts a navigation that is not a zone jump, so that a pending zone jump is dropped. */
        bumpNavigation() {
            navigationId++;
        },

        /** Shows a page (1-based). */
        setPage(number) {
            navigationId++;
            viewer.setAttribute("pagenumber", String(number));
            // The viewer fires page-changed only when it navigates, not when it opens on this page, so the
            // overlays are loaded here.
            pageNumber = number;
            imageDoc.loadOverlays(imageDoc.pageIdAt(number));
        },

        /**
         * Navigates the viewer to a zone, after loading it if necessary (measure ids are loaded with their page).
         * @param {string} key - A key of imageDoc.navZones (or a measure id still to be loaded)
         * @param {{ isCurrent?: () => boolean }} [options] - `isCurrent` is asked once the zone could be applied;
         *   returning false drops the jump (e.g. the view mode changed meanwhile)
         * @returns {Promise<boolean>} Whether the zone was applied
         */
        async gotoZone(key, { isCurrent } = {}) {
            const id = ++navigationId;
            await imageDoc.ensureZoneLoaded(key);
            await imageReady;
            // The user stepped elsewhere while the zone was loading or the viewer was opening.
            if (id !== navigationId) return false;
            if (isCurrent && !isCurrent()) return false;
            if (!imageDoc.navZones[key]) {
                console.warn(`Image view: no zone found for "${key}".`);
                return false;
            }
            session.pushZones(key);
            // The nonce makes the viewer fit the zone again even when the key is unchanged (a slice key is reused
            // for the next measure).
            viewer.setAttribute("zone", `${key}|${++zoneNonce}`);
            activeZoneKey = key;
            // Same as in setPage: the viewer may open on this page without firing page-changed.
            pageNumber = imageDoc.navZones[key].page;
            imageDoc.loadOverlays(imageDoc.pageIdAt(pageNumber));
            return true;
        },

        /** Fits the active zone again (e.g. after the viewer was resized). */
        refit() {
            if (!activeZoneKey || !imageDoc.navZones[activeZoneKey]) return;
            session.pushZones(activeZoneKey);
            viewer.setAttribute("zone", `${activeZoneKey}|${++zoneNonce}`);
        },

        /** Shows the overlay types that are switched on. */
        applyVisibleTypes() {
            const types = [];
            if (imageDoc.overlays.showMeasures) types.push("measure");
            if (imageDoc.overlays.showAnnotations) types.push("annotation");
            viewer.setAttribute("visible-types", JSON.stringify(types));
        },

        /** Loads the overlay data of the page the viewer shows. */
        loadOverlaysForCurrentPage() {
            return imageDoc.loadOverlays(imageDoc.pageIdAt(pageNumber));
        },

        /** Detaches the session and destroys the viewer's OpenSeadragon instance (and its WebGL context). */
        dispose() {
            cancelImageReady?.();
            viewer.removeEventListener("page-changed", onPageChanged);
            viewer.removeEventListener("zone-click", onZoneClick);
            imageDoc.sessions.delete(session);
            viewer.openSeaDragon?.destroy();
        }
    };

    imageDoc.sessions.add(session);
    session.applyVisibleTypes();
    return session;
}
