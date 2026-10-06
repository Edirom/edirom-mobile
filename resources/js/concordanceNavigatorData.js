import { parseTargets, buildTargetsStringWithConfig } from "./targets.js";

/**
 * Builds the navigator data for a concordance connection.
 *
 * The members of the connection (the URIs of its plist) are placed into the structure of the
 * edition's navigatorConfig, so they live in the same (sub-)categories and carry the same names.
 * Members without a counterpart in the config are collected in two trailing categories
 * ("additional documents" / "additional resources").
 *
 * This module is pure: no DOM, no network, no app state. Names that stay unknown
 * (see `collectNameless`) and platform specific target prefs are added by the caller.
 *
 * Matching rules (a config target T binds a member M if T and M point to the same document):
 *  - exact:     T and M have the same hash (both may be empty).
 *  - hash-less: T has no hash, M has one. M is still listed, with its own hash as target.
 *  - A config hash that differs from M's hash (or M has none) never matches.
 *  - Exact beats hash-less: a member that matches some config target exactly ignores the hash-less ones.
 *  - A member is placed at every config item it matches. Several members may match one item.
 *  - An item with several targets is placed only if every one of its targets is bound to a member.
 *  - Prefs (`[width:825]`) of the config are not transferred; the member's own prefs are kept.
 *  - Categories without any placed item disappear, and so do separators.
 */

const DOC_URI = /^xmldb:exist/;
const EXTERNAL_URI = /^(https?:|www\.)/;

/**
 * Parses the plist of a connection into members.
 * Members are separated by whitespace or semicolons; a `[...]` pref block belongs to the URI it follows.
 * @param {string} plist
 * @returns {Array<{uri: string, doc: string, hash: string, type: "doc"|"external"|"unknown", name: string, prefs: Object}>}
 *   `uri` is the URI without prefs, `name` is the `[name:..]` pref or an empty string, `prefs` are the remaining prefs.
 */
export function splitMembers(plist) {
    return tokenize(plist)
        .flatMap(token => parseTargets(token))
        .map(({ target, config }) => {
            const { name = "", ...prefs } = config;
            return { uri: target, ...splitUri(target), type: getType(target), name: String(name), prefs };
        });
}

/** Splits a plist at whitespace/semicolons, but not inside a `[...]` block. */
function tokenize(plist) {
    const tokens = [];
    let current = "";
    let depth = 0;
    for (const char of plist ?? "") {
        if (char === "[") depth++;
        if (char === "]") depth = Math.max(0, depth - 1);
        if (depth === 0 && (/\s/.test(char) || char === ";")) {
            if (current) tokens.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

function getType(uri) {
    if (DOC_URI.test(uri)) return "doc";
    if (EXTERNAL_URI.test(uri)) return "external";
    return "unknown";
}

/**
 * Splits a URI into its document and its hash (everything from the first `#`, so `#a#b` is one opaque hash).
 * For documents a `?term=`/`?path=` query counts as part of the hash, too.
 * @param {string} uri - A URI without prefs
 * @returns {{doc: string, hash: string}}
 */
export function splitUri(uri) {
    const splitAt = DOC_URI.test(uri) ? uri.search(/[#?]/) : uri.indexOf("#");
    return splitAt === -1 ? { doc: uri, hash: "" } : { doc: uri.slice(0, splitAt), hash: uri.slice(splitAt) };
}

/**
 * Collects all items of a navigatorDefinition (any depth) together with their parsed targets.
 * Items without targets can never match and are left out.
 * @param {Array} definition - A navigatorDefinition
 * @returns {Array<{item: Object, targets: Array<{doc: string, hash: string}>}>}
 */
export function indexConfigItems(definition) {
    return (definition ?? []).flatMap(node => {
        if (node.type === "navigatorCategory") return indexConfigItems(node.items);
        if (node.type !== "navigatorItem") return [];
        const targets = parseTargets(node.targets).map(({ target }) => splitUri(target));
        return targets.length ? [{ item: node, targets }] : [];
    });
}

function matchKind(member, target) {
    if (member.doc !== target.doc) return null;
    if (member.hash === target.hash) return "exact";
    return target.hash === "" ? "hash-less" : null;
}

/**
 * Binds every member to the config targets it matches.
 * @param {Array} members - From `splitMembers`
 * @param {Array} configItems - From `indexConfigItems`
 * @returns {Map<Object, Array<Array<Object>>>} For each config item one list of bound members per target, in plist order
 */
export function bindMembers(members, configItems) {
    const bound = new Map(configItems.map(({ item, targets }) => [item, targets.map(() => [])]));

    for (const member of members) {
        const hits = configItems.flatMap(({ item, targets }) =>
            targets.flatMap((target, index) => {
                const kind = matchKind(member, target);
                return kind ? [{ item, index, kind }] : [];
            }));
        const exactHits = hits.filter(hit => hit.kind === "exact");

        for (const { item, index } of exactHits.length ? exactHits : hits) {
            bound.get(item)[index].push(member);
        }
    }
    return bound;
}

/** Creates a generator for unique item ids. */
export function createItemIdGenerator() {
    let counter = 0;
    return () => `concordance-item-${counter++}`;
}

/** Builds the navigator item for one or more members; `configItem` is the config item it replaces, if any. */
function createItem(members, configItem, nextItemId) {
    const [first, ...rest] = members;
    const item = {
        id: nextItemId(),
        type: "navigatorItem",
        name: members.map(member => member.name).find(Boolean) || configItem?.name || "",
        targets: [buildTargetsStringWithConfig(first.uri, first.prefs), ...rest.map(member => member.uri)].join(" ")
    };
    if (configItem?.icons) item.icons = [...configItem.icons];
    return item;
}

/** The items a config item turns into: one per member for a single target, one in total for several targets. */
function placeConfigItem(configItem, membersPerTarget, nextItemId) {
    if (membersPerTarget.some(members => members.length === 0)) return [];
    if (membersPerTarget.length === 1) {
        return membersPerTarget[0].map(member => ({ item: createItem([member], configItem, nextItemId), members: [member] }));
    }
    const members = membersPerTarget.map(list => list[0]);
    return [{ item: createItem(members, configItem, nextItemId), members }];
}

/**
 * Copies the structure of the navigatorDefinition, replacing the config items by the members bound to them
 * and dropping everything that ends up empty.
 * @param {Array} definition - The config's navigatorDefinition
 * @param {Map} bound - From `bindMembers`
 * @param {Function} nextItemId - From `createItemIdGenerator`
 * @param {Set<Object>} placed - Receives the members that were placed
 * @returns {Array} The projected navigatorDefinition
 */
export function projectOntoConfig(definition, bound, nextItemId, placed) {
    return (definition ?? []).flatMap(node => {
        if (node.type === "navigatorCategory") {
            const items = projectOntoConfig(node.items, bound, nextItemId, placed);
            return items.length ? [{ id: `concordance-${node.id}`, type: "navigatorCategory", name: node.name, items }] : [];
        }
        if (node.type !== "navigatorItem" || !bound.has(node)) return [];

        return placeConfigItem(node, bound.get(node), nextItemId).map(({ item, members }) => {
            members.forEach(member => placed.add(member));
            return item;
        });
    });
}

/**
 * Builds the two trailing categories for the members that were not placed.
 * Empty categories are omitted, members of an unknown URI type are ignored.
 * @param {Array} members - The unplaced members
 * @param {{additionalDocuments: string, additionalResources: string}} labels - The category names
 * @param {Function} nextItemId - From `createItemIdGenerator`
 * @returns {Array} Zero to two navigator categories
 */
export function buildRemainderCategories(members, labels, nextItemId) {
    const groups = [
        { id: "concordance-more-docs", name: labels.additionalDocuments, type: "doc" },
        { id: "concordance-more-resources", name: labels.additionalResources, type: "external" }
    ];
    return groups
        .map(({ id, name, type }) => ({
            id,
            type: "navigatorCategory",
            name,
            items: members.filter(member => member.type === type).map(member => createItem([member], null, nextItemId))
        }))
        .filter(category => category.items.length > 0);
}

/**
 * Collects the items that still have no name, at any depth.
 * @param {Array} definition - A navigatorDefinition
 * @returns {Array<Object>} The navigator items without a name
 */
export function collectNameless(definition) {
    return (definition ?? []).flatMap(node => {
        if (node.type === "navigatorCategory") return collectNameless(node.items);
        return node.type === "navigatorItem" && !node.name ? [node] : [];
    });
}

/**
 * Builds the navigator data for a concordance connection (see the module description).
 * @param {string} plist - The plist of the connection
 * @param {Array} configDefinition - The navigatorDefinition of the edition's navigatorConfig
 * @param {{additionalDocuments: string, additionalResources: string}} labels - Names of the two trailing categories
 * @returns {{navigatorDefinition: Array}} Some items may still lack a name, see `collectNameless`
 */
export function buildConcordanceNavigatorData(plist, configDefinition, labels) {
    const members = splitMembers(plist);
    const nextItemId = createItemIdGenerator();
    const placed = new Set();

    const bound = bindMembers(members, indexConfigItems(configDefinition));
    const projected = projectOntoConfig(configDefinition, bound, nextItemId, placed);
    const remainder = buildRemainderCategories(members.filter(member => !placed.has(member)), labels, nextItemId);

    return { navigatorDefinition: [...projected, ...remainder] };
}
