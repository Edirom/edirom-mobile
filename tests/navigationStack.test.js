import { test } from "node:test";
import assert from "node:assert/strict";
import { createNavigationStack } from "../resources/js/navigationStack.js";

const newStack = () => createNavigationStack({ loadId: "load1" });

test("a new stack is empty", () => {
    const stack = newStack();
    assert.equal(stack.depth, -1);
    assert.equal(stack.top, null);
    assert.equal(stack.previous, null);
});

test("push adds frames on top, previous is the frame below", () => {
    const stack = newStack();
    const navigator = stack.push("navigator");
    const image = stack.push("views");
    const annotation = stack.push("views");

    assert.equal(stack.depth, 2);
    assert.equal(stack.top, annotation);
    assert.equal(stack.previous, image);
    assert.equal(stack.at(0), navigator);
    assert.equal(new Set([navigator.id, image.id, annotation.id]).size, 3, "every frame has its own id");
    assert.deepEqual([navigator.kind, image.kind, annotation.kind], ["navigator", "views", "views"]);
});

test("update stores captured data in the frame and never overwrites id or kind", () => {
    const stack = newStack();
    const frame = stack.push("views");

    assert.equal(stack.update(frame.id, { id: 99, kind: "about", target: "xmldb:exist:///a.xml", viewState: { page: 3 } }), true);
    assert.equal(frame.id, stack.top.id);
    assert.equal(frame.kind, "views");
    assert.equal(frame.target, "xmldb:exist:///a.xml");
    assert.deepEqual(frame.viewState, { page: 3 });
});

test("update tells when the frame is gone or nothing was captured", () => {
    const stack = newStack();
    stack.push("navigator");
    const gone = stack.push("views");
    stack.truncateTo(0);

    assert.equal(stack.update(gone.id, { target: "x" }), false);
    assert.equal(stack.update(stack.top.id, null), false);
});

test("truncateTo drops the frames above and ignores a depth at or above the top", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");
    stack.push("views");

    stack.truncateTo(5);
    assert.equal(stack.depth, 2);
    stack.truncateTo(2);
    assert.equal(stack.depth, 2);
    stack.truncateTo(0);
    assert.equal(stack.depth, 0);
    assert.equal(stack.top.kind, "navigator");
});

test("replaceTop swaps the top frame, or adds the first one", () => {
    const stack = newStack();
    const first = stack.replaceTop("about");
    assert.equal(stack.depth, 0);

    stack.push("navigator");
    const replaced = stack.replaceTop("edition-selection");
    assert.equal(stack.depth, 1);
    assert.equal(stack.top, replaced);
    assert.notEqual(replaced.id, first.id);
    assert.equal(stack.at(0), first);
});

test("reset starts over with one frame and a new generation", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");
    const before = stack.generation;

    const root = stack.reset("navigator");

    assert.equal(stack.depth, 0);
    assert.equal(stack.top, root);
    assert.equal(stack.previous, null);
    assert.notEqual(stack.generation, before);
});

test("history states are plain data that the browser can store", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");

    const state = stack.historyState("views");
    assert.deepEqual(state, { depth: 1, gen: stack.generation, page: "views" });
    assert.deepEqual(structuredClone(state), state);
});

test("a state is recognised as the frame on screen", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");

    assert.deepEqual(stack.classifyPopstate(stack.historyState("views")), { type: "same", depth: 1 });
});

test("a state of a frame below the top one means Back, also across several entries", () => {
    const stack = newStack();
    stack.push("navigator");
    const navigatorState = stack.historyState("navigator");
    stack.push("views");
    const imageState = stack.historyState("views");
    stack.push("views");

    assert.deepEqual(stack.classifyPopstate(imageState), { type: "back", depth: 1 });
    assert.deepEqual(stack.classifyPopstate(navigatorState), { type: "back", depth: 0 });
});

test("a state of a frame that was left by going back means forward", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");
    const annotationState = (stack.push("views"), stack.historyState("views"));

    stack.truncateTo(1);

    assert.deepEqual(stack.classifyPopstate(annotationState), { type: "forward", depth: 2 });
});

test("no state is the guard entry below the first frame", () => {
    const stack = newStack();
    stack.push("navigator");

    assert.deepEqual(stack.classifyPopstate(null), { type: "guard" });
    assert.deepEqual(stack.classifyPopstate(undefined), { type: "guard" });
});

test("states of an earlier generation are stale, even at the same depth", () => {
    const stack = newStack();
    stack.push("navigator");
    stack.push("views");
    const oldState = stack.historyState("views");

    stack.reset("navigator");
    stack.push("views");

    assert.deepEqual(stack.classifyPopstate(oldState), { type: "stale" });
    assert.deepEqual(stack.classifyPopstate(stack.historyState("views")), { type: "same", depth: 1 });
});

test("entries of an earlier page load are stale (the browser keeps them across a reload)", () => {
    const before = createNavigationStack({ loadId: "before-reload" });
    before.push("navigator");
    before.push("views");
    const leftover = before.historyState("views");

    const after = createNavigationStack({ loadId: "after-reload" });
    after.push("navigator");
    after.push("views");

    assert.deepEqual(after.classifyPopstate(leftover), { type: "stale" });
});

test("states this app did not write are stale", () => {
    const stack = newStack();
    stack.push("navigator");

    assert.deepEqual(stack.classifyPopstate({}), { type: "stale" });
    assert.deepEqual(stack.classifyPopstate({ page: "navigator", edition: {} }), { type: "stale" });
    assert.deepEqual(stack.classifyPopstate({ depth: -1, gen: stack.generation }), { type: "stale" });
    assert.deepEqual(stack.classifyPopstate({ depth: "0", gen: stack.generation }), { type: "stale" });
});

test("two random load ids do not collide", () => {
    const first = createNavigationStack();
    const second = createNavigationStack();
    assert.notEqual(first.generation, second.generation);
});
