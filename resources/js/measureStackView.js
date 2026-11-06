import { getMeasurePage } from "./api.js";
import { createViewerSession } from "./imageViewerSession.js";
import { voiceRowsForGroup, mergeZones, sliceZones, alignRect } from "./measureVoices.js";

/**
 * The measure-based view of a part-wise source: one row per selected voice, stacked in score order, each
 * showing that voice's measure. A measure split across a system break is shown as slices side by side, the
 * first aligned to the right and the last to the left so that the halves meet (like Edirom-Frontend's
 * HorizontalMeasureViewer). Rows share the height in proportion to their measure's height, slices share a
 * row's width in proportion to their width, so all voices appear at about the same scale.
 *
 * Every slice is an `<edirom-image-viewer>` with all pages of the document (a page change is a cheap page
 * step, not a re-initialisation) driven by a viewer session on the shared image document.
 *
 * @param {Object} options
 * @param {ReturnType<import("./imageViewerSession.js").createImageDocument>} options.imageDoc
 * @param {(viewer: HTMLElement) => void} options.configureViewer - Applies the host's viewer attributes
 * @param {string} options.emptyMessage - Shown when no selected voice has a measure in the group
 */
export function createMeasureStack({ imageDoc, configureViewer, emptyMessage }) {
    const element = document.createElement("div");
    element.className = "measure-stack";

    const emptyElement = document.createElement("div");
    emptyElement.className = "measure-stack-empty display-none";
    emptyElement.textContent = emptyMessage;
    element.appendChild(emptyElement);

    const rows = new Map();          // voiceId → { voiceId, el, label, slices: [] }
    let token = 0;                   // counts showGroup calls; late data of an older one is dropped

    // getMeasurePage responses per measure id, for the current document.
    let requests = new Map();
    let requestsGeneration = imageDoc.generation;

    function measurePage(measureId) {
        if (requestsGeneration !== imageDoc.generation) {
            requests = new Map();
            requestsGeneration = imageDoc.generation;
        }
        if (!requests.has(measureId)) {
            requests.set(measureId, getMeasurePage(imageDoc.doc, imageDoc.edition, measureId).then(r => r || []));
        }
        return requests.get(measureId);
    }

    // The zones of a voice's measures. The first measure of a split measure already returns the following
    // part(s); further measures are only requested when they are not covered yet.
    async function loadZones(measureIds) {
        const first = await measurePage(measureIds[0]);
        const covered = new Set(first.map(entry => entry.measureId));
        const rest = await Promise.all(measureIds.slice(1).filter(id => !covered.has(id)).map(measurePage));
        const zones = mergeZones([first, ...rest]);
        for (const zone of zones) {
            if (zone.measureId) imageDoc.measurePageIdCache.set(zone.measureId, zone.pageId);
        }
        return zones;
    }

    // Re-fit a slice whenever its size changes: rotation, other rows added or removed, a second slice in the
    // row. The slices that changed in one frame are fitted together in the next.
    const resized = new Set();
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) resized.add(entry.target);
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            const targets = new Set(resized);
            resized.clear();
            for (const slice of allSlices()) {
                if (targets.has(slice.el)) fitSlice(slice);
            }
        });
    });

    function createRow(voiceId) {
        const el = document.createElement("div");
        el.className = "voice-row";
        el.dataset.voice = voiceId;
        const label = document.createElement("span");
        label.className = "voice-row-label";
        el.appendChild(label);
        return { voiceId, el, label, slices: [] };
    }

    function createSlice(row) {
        const el = document.createElement("div");
        el.className = "voice-slice";
        const viewer = document.createElement("edirom-image-viewer");
        viewer.classList.add("web-component");
        configureViewer(viewer);
        el.appendChild(viewer);
        row.el.appendChild(el);
        resizeObserver.observe(el);
        const session = createViewerSession(viewer, imageDoc);
        session.setTileSources();
        return { el, viewer, session, key: null, rect: null, align: "center" };
    }

    function disposeSlice(slice) {
        resizeObserver.unobserve(slice.el);
        slice.session.dispose();
        if (slice.key) delete imageDoc.navZones[slice.key];
        slice.el.remove();
    }

    function disposeRow(row) {
        row.slices.forEach(disposeSlice);
        row.el.remove();
        rows.delete(row.voiceId);
    }

    // Places the rows in score order. Existing rows are never moved (moving a viewer would disconnect it);
    // new rows are inserted before the next existing row of the order.
    function placeRows(order) {
        for (let i = 0; i < order.length; i++) {
            const row = rows.get(order[i]);
            if (row.el.isConnected) continue;
            const next = order.slice(i + 1).map(id => rows.get(id)).find(r => r.el.isConnected);
            element.insertBefore(row.el, next ? next.el : null);
        }
    }

    function layoutRow(row, slices) {
        while (row.slices.length < slices.length) row.slices.push(createSlice(row));
        while (row.slices.length > slices.length) disposeSlice(row.slices.pop());
        slices.forEach((slice, index) => {
            const target = row.slices[index];
            target.el.style.flexGrow = String(Math.max(1, slice.width));
            target.key = `voice-slice:${row.voiceId}:${index}`;
            target.rect = { page: imageDoc.pageIdToIndex.get(slice.pageId), ...slice.rect };
            target.align = slice.align;
        });
        row.el.style.flexGrow = String(Math.max(1, ...slices.map(slice => slice.height)));
    }

    // Fits a slice's measure into it, widened to the slice's aspect ratio towards its alignment.
    function fitSlice(slice, isCurrent) {
        if (!slice.rect?.page) return Promise.resolve(false);
        const box = slice.el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return Promise.resolve(false);
        const { page, ...rect } = slice.rect;
        imageDoc.navZones[slice.key] = { page, ...alignRect(rect, box.width / box.height, slice.align) };
        return slice.session.gotoZone(slice.key, { isCurrent });
    }

    function allSlices() {
        return [...rows.values()].flatMap(row => row.slices);
    }

    return {
        element,

        /**
         * Shows a measure group: one row per selected voice that has a measure in it.
         * @param {Object} group - A getMeasures entry
         * @param {Array} parts - The getParts response
         * @param {string[]|null} selectedIds - The selected voice ids
         * @returns {Promise<boolean>} false if a newer call superseded this one
         */
        async showGroup(group, parts, selectedIds) {
            const current = ++token;
            const isCurrent = () => current === token;
            const rowData = voiceRowsForGroup(group, parts, selectedIds);
            const wanted = new Set(rowData.map(r => r.voiceId));

            for (const row of [...rows.values()]) {
                if (!wanted.has(row.voiceId)) disposeRow(row);
            }

            const zonesPerRow = await Promise.all(rowData.map(r => loadZones(r.measureIds)));
            if (!isCurrent()) return false;

            // A voice may have lost its row while the zones were loading (another group with fewer voices).
            for (const row of [...rows.values()]) {
                if (!wanted.has(row.voiceId)) disposeRow(row);
            }

            let shown = 0;
            rowData.forEach((data, index) => {
                const slices = sliceZones(zonesPerRow[index]);
                let row = rows.get(data.voiceId);
                if (slices.length === 0) {
                    if (row) disposeRow(row);
                    return;
                }
                if (!row) {
                    row = createRow(data.voiceId);
                    rows.set(data.voiceId, row);
                }
                row.label.textContent = data.label;
                row.label.classList.toggle("display-none", !data.label);
                shown++;
            });
            placeRows(rowData.map(r => r.voiceId).filter(id => rows.has(id)));
            rowData.forEach((data, index) => {
                const row = rows.get(data.voiceId);
                if (row) layoutRow(row, sliceZones(zonesPerRow[index]));
            });
            emptyElement.classList.toggle("display-none", shown > 0);

            // Layout is settled: fit every slice (getBoundingClientRect forces the layout of the new flex values).
            await Promise.all(allSlices().map(slice => fitSlice(slice, isCurrent)));
            return isCurrent();
        },

        /** The page of the first shown slice (to continue in page view from there). */
        firstPageId() {
            for (const row of rows.values()) {
                const page = row.slices[0]?.rect?.page;
                if (page) return imageDoc.pageIdAt(page);
            }
            return null;
        },

        /** Applies the overlay toggles to every viewer and loads the overlays of their pages. */
        applyOverlays() {
            for (const slice of allSlices()) {
                slice.session.applyVisibleTypes();
                slice.session.loadOverlaysForCurrentPage();
            }
        },

        /** Removes all rows (e.g. for a new document). */
        clear() {
            token++;
            for (const row of [...rows.values()]) disposeRow(row);
            emptyElement.classList.add("display-none");
        },

        dispose() {
            this.clear();
            resizeObserver.disconnect();
            cancelAnimationFrame(resizeFrame);
        }
    };
}
