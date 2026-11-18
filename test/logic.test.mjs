import { test } from "node:test";
import assert from "node:assert/strict";
import { canDo, progress, sortedEntries, nextSort, orderObjectives, indentTarget, isUnread } from "../scripts/logic.mjs";

const gm = { isGM: true, isOwner: true, userId: "gm" };
const owner = { isGM: false, isOwner: true, userId: "p1" };
const observer = { isGM: false, isOwner: false, userId: "p2" };

test("canDo matrix", () => {
  assert.ok(canDo(gm, "edit"));
  assert.ok(!canDo(owner, "edit"));
  for (const a of ["tick", "add", "note"]) {
    assert.ok(canDo(owner, a), a);
    assert.ok(!canDo(observer, a), a);
  }
  assert.ok(canDo(owner, "editObjective", { createdBy: "p1" }));
  assert.ok(!canDo(owner, "editObjective", { createdBy: "gm" }));
  assert.ok(!canDo(owner, "editObjective", { createdBy: null }));
  assert.ok(canDo(owner, "editNote", { author: "p1" }));
  assert.ok(!canDo(owner, "editNote", { author: "p3" }));
  assert.ok(canDo(owner, "accept", { status: "hook" }));
  assert.ok(!canDo(owner, "accept", { status: "active" }));
  assert.ok(canDo(owner, "claim", { revealed: true, claimedBy: null }));
  assert.ok(!canDo(owner, "claim", { revealed: false, claimedBy: null }));
  assert.ok(!canDo(owner, "claim", { revealed: true, claimedBy: "Mira" }));
  assert.ok(canDo(gm, "editObjective", { createdBy: "p1" }));
  assert.ok(canDo(gm, "accept", { status: "hook" }));
  assert.ok(!canDo(gm, "accept", { status: "active" }));
  assert.ok(!canDo(gm, "claim", { revealed: true, claimedBy: null }));
});

const objs = {
  a: { text: "A", done: true, sort: 0 },
  b: { text: "B", done: false, sort: 1 },
  b1: { text: "B1", done: false, sort: 2, parent: "b" },
  h: { text: "H", done: false, sort: 3, hidden: true },
  o: { text: "O", done: false, sort: 4, optional: true },
  c: { text: "C", done: false, sort: 5 },
  orphan: { text: "Orphan", done: false, sort: 6, parent: "gone" },
  grand: { text: "Grand", done: false, sort: 7, parent: "b1" }
};

test("orderObjectives nests one level and handles orphans", () => {
  const ids = o => o.map(x => `${x.id}:${x.depth}`);
  assert.deepEqual(ids(orderObjectives(objs)), ["a:0", "b:0", "b1:1", "o:0", "c:0", "orphan:0", "grand:0"]);
  assert.deepEqual(ids(orderObjectives(objs, { showHidden: true })).slice(3, 4), ["h:0"]);
  assert.equal(orderObjectives(objs).find(o => o.isNext).id, "b");
});

test("progress skips optional and hidden", () => {
  assert.deepEqual(progress({}), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(progress(objs), { done: 1, total: 6, pct: 17 });
  assert.equal(progress(objs, { showHidden: true }).total, 7);
});

test("indentTarget", () => {
  const ordered = orderObjectives(objs);
  assert.equal(indentTarget(ordered, "c"), "o");
  assert.equal(indentTarget(ordered, "a"), null); // first row
  assert.equal(indentTarget(ordered, "b"), null); // has a sub-step
  assert.equal(indentTarget(ordered, "b1"), null); // already a sub-step
});

test("sortedEntries and nextSort", () => {
  const o = { b: { sort: 1 }, a: { sort: 1 }, c: { sort: 0 } };
  assert.deepEqual(sortedEntries(o).map(([id]) => id), ["c", "a", "b"]);
  assert.equal(nextSort(o), 2);
  assert.equal(nextSort({}), 0);
});

test("isUnread", () => {
  assert.ok(isUnread({ modifiedTime: 10, lastModifiedBy: "gm" }, "p1", 5));
  assert.ok(!isUnread({ modifiedTime: 10, lastModifiedBy: "gm" }, "p1", 10));
  assert.ok(!isUnread({ modifiedTime: 10, lastModifiedBy: "p1" }, "p1", 0));
  assert.ok(!isUnread(undefined, "p1", 0));
});

test("every PQL key used in code exists in en and pl", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const root = new URL("../", import.meta.url);
  const files = ["scripts", "templates"].flatMap(d => readdirSync(new URL(`${d}/`, root)).map(f => new URL(`${d}/${f}`, root)));
  const used = new Set(files.flatMap(f => readFileSync(f, "utf8").match(/PQL\.[A-Za-z]+(\.[A-Za-z]+)?/g) ?? []));
  for (const lang of ["en", "pl"]) {
    const json = JSON.parse(readFileSync(new URL(`lang/${lang}.json`, root), "utf8"));
    const missing = [...used].filter(k => typeof k.split(".").reduce((o, p) => o?.[p], json) !== "string");
    assert.deepEqual(missing, [], `${lang} is missing keys`);
  }
});
