import { test } from "node:test";
import assert from "node:assert/strict";
import {
    normalizeVoiceId, hasVoices, voiceRowsForGroup, mergeZones, sliceZones, unionRect, alignRect,
    findGroupIndex, matchingGroups, defaultVoiceSelection
} from "../resources/js/measureVoices.js";

// Cut from the backend responses for Weber, Klarinettenquintett, "Erstdruck I" (source-2.xml), movement 1.
const MDIV = "x2eb1eec1-5284-429c-9a80-c16ebe4e8233";

const PARTS = [
    { selectedByDefault: true, label: "Klarinette", id: "perfRes-voice-1", selected: true },
    { selectedByDefault: true, label: "Violine I", id: "perfRes-voice-2", selected: true },
    { selectedByDefault: true, label: "Violine II", id: "perfRes-voice-3", selected: true },
    { selectedByDefault: true, label: "Viola", id: "perfRes-voice-4", selected: true },
    { selectedByDefault: true, label: "cello", id: "perfRes-voice-5", selected: true }
];

const M1 = {
    measures: [
        { voice: "#perfRes-voice-1", id: "barGroup-1083", partLabel: "Klarinette" },
        { voice: "#perfRes-voice-2", id: "bar-864", partLabel: "Violine I" },
        { voice: "#perfRes-voice-3", id: "bar-3312", partLabel: "Violine II" },
        { voice: "#perfRes-voice-4", id: "bar-4148", partLabel: "Viola" },
        { voice: "#perfRes-voice-5", id: "bar-4990", partLabel: "cello" }
    ],
    name: "1", mdivs: [MDIV], id: `measure_${MDIV}_1`
};

// The clarinet rests (its multiRest is only listed under measure 1).
const M2 = {
    measures: [
        { voice: "#perfRes-voice-2", id: "bar-865", partLabel: "Violine I" },
        { voice: "#perfRes-voice-3", id: "bar-3313", partLabel: "Violine II" },
        { voice: "#perfRes-voice-4", id: "bar-4149", partLabel: "Viola" },
        { voice: "#perfRes-voice-5", id: "bar-4991", partLabel: "cello" }
    ],
    name: "2", mdivs: [MDIV], id: `measure_${MDIV}_2`
};

// The viola's measure 19 is split across a system break (two measure elements).
const M19 = {
    measures: [
        { voice: "#perfRes-voice-1", id: "bar-1091", partLabel: "Klarinette" },
        { voice: "#perfRes-voice-2", id: "bar-882", partLabel: "Violine I" },
        { voice: "#perfRes-voice-3", id: "bar-3330", partLabel: "Violine II" },
        { voice: "#perfRes-voice-4", id: "bar-4166", partLabel: "Viola" },
        { voice: "#perfRes-voice-4", id: "bar-4167", partLabel: "Viola" },
        { voice: "#perfRes-voice-5", id: "bar-5008", partLabel: "cello" }
    ],
    name: "19", mdivs: [MDIV], id: `measure_${MDIV}_19`
};

// A measure only one voice has: the group carries the measure's own id.
const M77 = {
    measures: [{ voice: "#perfRes-voice-1", id: "bar-1149", partLabel: "Klarinette" }],
    name: "77", mdivs: [MDIV], id: "bar-1149"
};

const MEASURES = [M1, M2, M19, M77];

// getMeasurePage for bar-4166 (returns both halves) and bar-4167.
const PAGE_4166 = [
    { width: "3422", height: "3840", zoneId: "zone_bar-4166", measureId: "bar-4166", lry: "873", path: "Erstdruck1/34_ED-st_I_028_Vla_1v", uly: "618", movementId: MDIV, lrx: "2976", pageId: "facsimile-37128", ulx: "2643" },
    { width: "3422", height: "3840", zoneId: "zone_bar-4167", measureId: "bar-4167", lry: "1082", path: "Erstdruck1/34_ED-st_I_028_Vla_1v", uly: "860", movementId: MDIV, lrx: "955", pageId: "facsimile-37128", ulx: "527" }
];
const PAGE_4167 = [PAGE_4166[1]];

test("normalizeVoiceId strips the reference marker", () => {
    assert.equal(normalizeVoiceId("#perfRes-voice-1"), "perfRes-voice-1");
    assert.equal(normalizeVoiceId("score"), "score");
    assert.equal(normalizeVoiceId(["#a", "#b"]), "a");
    assert.equal(normalizeVoiceId("#a #b"), "a");
    assert.equal(normalizeVoiceId(undefined), "");
});

test("hasVoices tells part-wise from score measures", () => {
    assert.equal(hasVoices(MEASURES), true);
    assert.equal(hasVoices([{ measures: [{ id: "bar-1", voice: "score" }] }]), false);
    assert.equal(hasVoices(null), false);
});

test("voiceRowsForGroup gives one row per voice in score order", () => {
    const rows = voiceRowsForGroup(M1, PARTS, null);
    assert.deepEqual(rows.map(r => r.voiceId), PARTS.map(p => p.id));
    assert.deepEqual(rows.map(r => r.label), ["Klarinette", "Violine I", "Violine II", "Viola", "cello"]);
    assert.deepEqual(rows[0].measureIds, ["barGroup-1083"]);
});

test("voiceRowsForGroup leaves out voices without a measure, like Edirom-Frontend", () => {
    const rows = voiceRowsForGroup(M2, PARTS, null);
    assert.deepEqual(rows.map(r => r.voiceId), ["perfRes-voice-2", "perfRes-voice-3", "perfRes-voice-4", "perfRes-voice-5"]);
});

test("voiceRowsForGroup keeps the measures of a split measure together", () => {
    const viola = voiceRowsForGroup(M19, PARTS, null).find(r => r.voiceId === "perfRes-voice-4");
    assert.deepEqual(viola.measureIds, ["bar-4166", "bar-4167"]);
});

test("voiceRowsForGroup applies the selection", () => {
    const rows = voiceRowsForGroup(M1, PARTS, ["perfRes-voice-5", "perfRes-voice-1"]);
    assert.deepEqual(rows.map(r => r.voiceId), ["perfRes-voice-1", "perfRes-voice-5"]);
});

test("voiceRowsForGroup shows voices unknown to getParts after the known ones", () => {
    const group = { measures: [{ voice: "#other", id: "x", partLabel: "Other" }, ...M1.measures.slice(0, 1)] };
    const rows = voiceRowsForGroup(group, PARTS, ["perfRes-voice-1"]);
    assert.deepEqual(rows.map(r => [r.voiceId, r.label]), [["perfRes-voice-1", "Klarinette"], ["other", "Other"]]);
});

test("voiceRowsForGroup treats score measures as one voice", () => {
    const group = { measures: [{ voice: "score", id: "bar-200155" }, { voice: "score", id: "bar-200222" }] };
    assert.deepEqual(voiceRowsForGroup(group, [], null), [{ voiceId: "score", label: "", measureIds: ["bar-200155", "bar-200222"] }]);
});

test("mergeZones removes duplicates and empty entries", () => {
    const empty = [{ width: null, height: null, zoneId: "", measureId: null, pageId: null, ulx: null, uly: null, lrx: null, lry: null }];
    const zones = mergeZones([PAGE_4166, PAGE_4167, empty, null]);
    assert.deepEqual(zones.map(z => z.zoneId), ["zone_bar-4166", "zone_bar-4167"]);
    assert.deepEqual(zones[0], { measureId: "bar-4166", zoneId: "zone_bar-4166", pageId: "facsimile-37128", ulx: 2643, uly: 618, lrx: 2976, lry: 873 });
});

test("sliceZones starts a new slice at a system break", () => {
    const slices = sliceZones(mergeZones([PAGE_4166]));
    assert.equal(slices.length, 2);
    assert.deepEqual(slices.map(s => s.align), ["right", "left"]);
    assert.deepEqual(slices[0].rect, { ulx: 2643, uly: 618, lrx: 2976, lry: 873 });
    assert.equal(slices[1].width, 955 - 527);
    assert.equal(slices[1].height, 1082 - 860);
});

test("sliceZones keeps zones on one system together and splits on a page change", () => {
    const zones = [
        { pageId: "p1", ulx: 100, uly: 10, lrx: 200, lry: 60 },
        { pageId: "p1", ulx: 200, uly: 12, lrx: 320, lry: 64 },
        { pageId: "p2", ulx: 400, uly: 10, lrx: 500, lry: 60 }
    ];
    const slices = sliceZones(zones);
    assert.equal(slices.length, 2);
    assert.deepEqual(slices[0].rect, { ulx: 100, uly: 10, lrx: 320, lry: 64 });
    assert.equal(slices[0].zones.length, 2);
    assert.equal(sliceZones([zones[0]])[0].align, "center");
    assert.deepEqual(sliceZones([]), []);
});

test("unionRect is the bounding box", () => {
    assert.deepEqual(unionRect([{ ulx: 5, uly: 2, lrx: 10, lry: 8 }, { ulx: 1, uly: 4, lrx: 7, lry: 9 }]), { ulx: 1, uly: 2, lrx: 10, lry: 9 });
});

test("alignRect widens towards the aligned side", () => {
    const rect = { ulx: 100, uly: 0, lrx: 200, lry: 100 }; // 1:1
    assert.deepEqual(alignRect(rect, 2, "right"), { ulx: 0, uly: 0, lrx: 200, lry: 100 });
    assert.deepEqual(alignRect(rect, 2, "left"), { ulx: 100, uly: 0, lrx: 300, lry: 100 });
    assert.deepEqual(alignRect(rect, 2, "center"), { ulx: 50, uly: 0, lrx: 250, lry: 100 });
    // Wider than the container: heightened around the centre, whatever the alignment.
    assert.deepEqual(alignRect(rect, 0.5, "right"), { ulx: 100, uly: -50, lrx: 200, lry: 150 });
    assert.deepEqual(alignRect(rect, 0, "right"), rect);
});

test("findGroupIndex finds groups by group id, any voice's measure id and virtual id", () => {
    assert.equal(findGroupIndex(MEASURES, `measure_${MDIV}_2`), 1);
    assert.equal(findGroupIndex(MEASURES, "bar-4167"), 2);
    assert.equal(findGroupIndex(MEASURES, "bar-1149"), 3);
    assert.equal(findGroupIndex(MEASURES, "bar-4990?tstamp2=1m+0"), 0);
    assert.equal(findGroupIndex(MEASURES, "unknown"), -1);
    assert.equal(findGroupIndex(null, "bar-1"), -1);
});

test("findGroupIndex resolves virtual ids by name when the group carries a real id", () => {
    const data = [{ id: "bar-1", name: "1", mdivs: ["mdiv_with_underscores"], measures: [{ id: "bar-1" }] }];
    assert.equal(findGroupIndex(data, "measure_mdiv_with_underscores_1"), 0);
    assert.equal(findGroupIndex(data, "measure_other_1"), -1);
});

test("defaultVoiceSelection prefers a valid stored selection", () => {
    assert.deepEqual(defaultVoiceSelection(PARTS, ["perfRes-voice-4", "gone", "perfRes-voice-1"]), ["perfRes-voice-1", "perfRes-voice-4"]);
    assert.deepEqual(defaultVoiceSelection(PARTS, ["gone"]), PARTS.map(p => p.id));
    assert.deepEqual(defaultVoiceSelection(PARTS, null), PARTS.map(p => p.id));
});

test("defaultVoiceSelection follows selectedByDefault and never selects nothing", () => {
    const parts = [{ id: "a", selectedByDefault: true }, { id: "b", selectedByDefault: false }];
    assert.deepEqual(defaultVoiceSelection(parts, undefined), ["a"]);
    assert.deepEqual(defaultVoiceSelection([{ id: "a", selectedByDefault: false }], undefined), ["a"]);
    assert.deepEqual(defaultVoiceSelection(null, undefined), []);
});

test("matchingGroups finds every group a set of references points to, in sequence order", () => {
    assert.deepEqual(matchingGroups(MEASURES, ["bar-1149", "bar-865", `measure_${MDIV}_19`]).map(g => g.name), ["2", "19", "77"]);
    const ranged = [{ id: "a", name: "1", measures: [{ id: "rest" }] }, { id: "b", name: "2", measures: [{ id: "rest" }] }];
    assert.deepEqual(matchingGroups(ranged, ["rest"]).map(g => g.id), ["a", "b"]);
    assert.deepEqual(matchingGroups(MEASURES, ["nothing"]), []);
    assert.deepEqual(matchingGroups(MEASURES, []), []);
});
