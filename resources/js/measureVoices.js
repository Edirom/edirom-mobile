/**
 * The data side of the measure-based view of part-wise sources: which voices show a row for a measure group,
 * how a voice's zones are split into side-by-side slices, and how measure references are found.
 *
 * This module is pure: no DOM, no network, no app state. The shapes are those of the backend:
 * - getMeasures.xql: `[{ id, name, mdivs, measures: [{ id, voice: "#perfRes-…" | "score", partLabel? }] }]`
 *   (`id` is the measure's xml:id when the group holds one measure, otherwise `measure_<mdiv>_<name>`)
 * - getParts.xql: `[{ id, label, selectedByDefault }]`, in score order
 * - getMeasurePage.xql: `[{ measureId, zoneId, pageId, ulx, uly, lrx, lry, … }]`
 */

/** The voice of the measures of a source without parts. */
export const SCORE_VOICE = "score";

/**
 * Returns the perfRes id a measure's `voice` refers to: `"#perfRes-voice-1"` → `"perfRes-voice-1"`. A part with
 * several staffDefs yields several references; the first is used.
 * @param {string|string[]|null|undefined} voice
 * @returns {string}
 */
export function normalizeVoiceId(voice) {
    const first = Array.isArray(voice) ? voice[0] : voice;
    const token = String(first ?? "").trim().split(/\s+/)[0] || "";
    return token.startsWith("#") ? token.slice(1) : token;
}

/**
 * Whether the measures come from parts (and so belong to voices) rather than from a score.
 * @param {Array} measuresData - The getMeasures response
 * @returns {boolean}
 */
export function hasVoices(measuresData) {
    return Array.isArray(measuresData) && measuresData.some(group =>
        (group.measures || []).some(m => normalizeVoiceId(m.voice) && normalizeVoiceId(m.voice) !== SCORE_VOICE));
}

/**
 * The rows the measure-based view shows for a measure group: one per selected voice that has a measure in the
 * group, in score order (the order of `parts`). Voices that getParts does not know are shown after the known
 * ones (they cannot be deselected). Like Edirom-Frontend, a voice without a measure in the group (e.g. during a
 * multi-measure rest) has no row. Several measures of one voice (a measure split across a system break) are
 * kept together in `measureIds`.
 * @param {{measures: Array<{id: string, voice: *, partLabel?: string}>}} group - A getMeasures entry
 * @param {Array<{id: string, label: string}>} parts - The getParts response
 * @param {Iterable<string>|null} selectedIds - The selected voice ids, or null for all
 * @returns {Array<{voiceId: string, label: string, measureIds: string[]}>}
 */
export function voiceRowsForGroup(group, parts, selectedIds) {
    const partList = Array.isArray(parts) ? parts : [];
    const partIndex = new Map(partList.map((part, index) => [part.id, index]));
    const selected = selectedIds ? new Set(selectedIds) : null;

    const rowsByVoice = new Map();
    for (const measure of group?.measures || []) {
        if (!measure?.id) continue;
        const voiceId = normalizeVoiceId(measure.voice) || SCORE_VOICE;
        let row = rowsByVoice.get(voiceId);
        if (!row) {
            const part = partList[partIndex.get(voiceId)];
            row = { voiceId, label: part?.label || measure.partLabel || "", measureIds: [] };
            rowsByVoice.set(voiceId, row);
        }
        if (!row.measureIds.includes(measure.id)) row.measureIds.push(measure.id);
    }

    const known = (row) => partIndex.has(row.voiceId);
    return [...rowsByVoice.values()]
        .filter(row => !known(row) || !selected || selected.has(row.voiceId))
        .sort((a, b) => {
            const ia = known(a) ? partIndex.get(a.voiceId) : Infinity;
            const ib = known(b) ? partIndex.get(b.voiceId) : Infinity;
            return ia === ib ? 0 : ia - ib;
        });
}

/**
 * Converts getMeasurePage responses into zones with numeric coordinates, dropping entries without a zone
 * (e.g. the empty entry returned for an unknown measure) and duplicates (the first half of a split measure
 * already returns the second half as well).
 * @param {Array<Array<Object>|null>} responses - One getMeasurePage response per requested measure
 * @returns {Array<{measureId: string, zoneId: string, pageId: string, ulx: number, uly: number, lrx: number, lry: number}>}
 */
export function mergeZones(responses) {
    const zones = [];
    const seen = new Set();
    for (const response of responses || []) {
        for (const entry of response || []) {
            if (!entry?.zoneId || !entry.pageId) continue;
            const rect = ["ulx", "uly", "lrx", "lry"].map(key => Number(entry[key]));
            if (rect.some(v => !Number.isFinite(v))) continue;
            if (seen.has(entry.zoneId)) continue;
            seen.add(entry.zoneId);
            const [ulx, uly, lrx, lry] = rect;
            zones.push({ measureId: entry.measureId, zoneId: entry.zoneId, pageId: entry.pageId, ulx, uly, lrx, lry });
        }
    }
    return zones;
}

/**
 * Splits a voice's zones into the slices shown side by side in its row, like Edirom-Frontend's
 * HorizontalMeasureViewer: a new slice starts on another page, or where a zone lies left of the previous one
 * (the next system). The slices of a split measure are aligned towards each other: the first to the right,
 * the last to the left, a single slice is centred.
 * @param {Array<{pageId: string, ulx: number, uly: number, lrx: number, lry: number}>} zones - In reading order
 * @returns {Array<{pageId: string, zones: Array, rect: {ulx: number, uly: number, lrx: number, lry: number}, width: number, height: number, align: "center"|"right"|"left"}>}
 */
export function sliceZones(zones) {
    const slices = [];
    let previous = null;
    for (const zone of zones || []) {
        const startsNew = !previous || zone.pageId !== previous.pageId || zone.ulx < previous.ulx;
        if (startsNew) slices.push({ pageId: zone.pageId, zones: [] });
        slices[slices.length - 1].zones.push(zone);
        previous = zone;
    }
    return slices.map((slice, index) => {
        const rect = unionRect(slice.zones);
        let align = "center";
        if (slices.length > 1) align = index === 0 ? "right" : index === slices.length - 1 ? "left" : "center";
        return {
            pageId: slice.pageId,
            zones: slice.zones,
            rect,
            width: rect.lrx - rect.ulx,
            height: rect.lry - rect.uly,
            align
        };
    });
}

/**
 * The bounding box of some zones.
 * @param {Array<{ulx: number, uly: number, lrx: number, lry: number}>} zones
 * @returns {{ulx: number, uly: number, lrx: number, lry: number}}
 */
export function unionRect(zones) {
    return {
        ulx: Math.min(...zones.map(z => z.ulx)),
        uly: Math.min(...zones.map(z => z.uly)),
        lrx: Math.max(...zones.map(z => z.lrx)),
        lry: Math.max(...zones.map(z => z.lry))
    };
}

/**
 * Widens (or heightens) a rectangle to a container's aspect ratio, so that fitting it shows the rectangle at the
 * given side of the container instead of centred. Slices of a split measure are aligned this way, so that the
 * two halves meet in the middle of the row. Height is never anchored: a rectangle that is wider than the
 * container is heightened around its centre.
 * @param {{ulx: number, uly: number, lrx: number, lry: number}} rect
 * @param {number} aspect - Container width / height
 * @param {"center"|"right"|"left"} [align]
 * @returns {{ulx: number, uly: number, lrx: number, lry: number}}
 */
export function alignRect(rect, aspect, align = "center") {
    const width = rect.lrx - rect.ulx;
    const height = rect.lry - rect.uly;
    if (!(aspect > 0) || !(width > 0) || !(height > 0)) return { ...rect };
    if (width / height < aspect) {
        const newWidth = height * aspect;
        let ulx;
        if (align === "right") ulx = rect.lrx - newWidth;
        else if (align === "left") ulx = rect.ulx;
        else ulx = rect.ulx - (newWidth - width) / 2;
        return { ulx, uly: rect.uly, lrx: ulx + newWidth, lry: rect.lry };
    }
    const newHeight = width / aspect;
    const uly = rect.uly - (newHeight - height) / 2;
    return { ulx: rect.ulx, uly, lrx: rect.lrx, lry: uly + newHeight };
}

/**
 * Finds the measure group a measure reference points to: the group's own id, the xml:id of any of its
 * measures (in any voice), or a virtual `measure_<mdiv>_<name>` id. A `?tstamp2=…` suffix is ignored.
 * @param {Array<{id: string, name: string, mdivs?: string[], measures: Array<{id: string}>}>} measuresData
 * @param {string} reference
 * @returns {number} The index, or -1
 */
export function findGroupIndex(measuresData, reference) {
    if (!Array.isArray(measuresData) || !reference) return -1;
    const id = String(reference).split("?")[0];

    let index = measuresData.findIndex(group => group.id === id);
    if (index !== -1) return index;

    index = measuresData.findIndex(group => (group.measures || []).some(m => m.id === id));
    if (index !== -1) return index;

    // Virtual id: the name follows the last underscore (mdiv ids may contain underscores themselves).
    const match = /^measure_(.+)_([^_]+)$/.exec(id);
    if (match) {
        const [, mdiv, name] = match;
        index = measuresData.findIndex(group =>
            String(group.name) === name && (!group.mdivs || group.mdivs.length === 0 || group.mdivs.includes(mdiv)));
    }
    return index;
}

/**
 * The measure groups a set of measure references points to (e.g. the targets of a concordance connection), in
 * sequence order. A reference matches a group by the group's id or the xml:id of any of its measures (a
 * measure with a range label belongs to several groups), or as a virtual `measure_<mdiv>_<name>` id.
 * @param {Array<{id: string, name: string, measures: Array<{id: string}>}>} measuresData
 * @param {string[]} references
 * @returns {Array<Object>} The matching groups
 */
export function matchingGroups(measuresData, references) {
    if (!Array.isArray(measuresData) || !Array.isArray(references) || references.length === 0) return [];
    const ids = new Set(references.map(ref => String(ref).split("?")[0]));
    const matched = new Set();
    measuresData.forEach((group, index) => {
        if (ids.has(group.id) || (group.measures || []).some(m => ids.has(m.id))) matched.add(index);
    });
    for (const id of ids) {
        if (/^measure_/.test(id)) {
            const index = findGroupIndex(measuresData, id);
            if (index !== -1) matched.add(index);
        }
    }
    return [...matched].sort((a, b) => a - b).map(index => measuresData[index]);
}

/**
 * The voices selected when a source is opened: a stored selection (as far as its voices still exist),
 * otherwise the parts the backend selects by default, and never none.
 * @param {Array<{id: string, selectedByDefault?: boolean}>} parts - The getParts response
 * @param {string[]|null|undefined} stored - A selection remembered earlier
 * @returns {string[]} Voice ids, in score order
 */
export function defaultVoiceSelection(parts, stored) {
    const list = Array.isArray(parts) ? parts : [];
    const ids = list.map(part => part.id).filter(Boolean);
    if (Array.isArray(stored)) {
        const storedSet = new Set(stored);
        const valid = ids.filter(id => storedSet.has(id));
        if (valid.length > 0) return valid;
    }
    const byDefault = list.filter(part => part.id && part.selectedByDefault !== false).map(part => part.id);
    return byDefault.length > 0 ? byDefault : ids;
}
