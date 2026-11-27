import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REHEARSAL_HANDOFF_STORAGE_KEY,
  decodeRehearsalHandoff,
  encodeRehearsalHandoff,
  selectedToCell,
  stashRehearsalHandoff,
  takeRehearsalHandoff,
} from "../../../../gakumas-tools/utils/rehearsalHandoff.js";

function createStorage(initial = {}, { failOver = Infinity } = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem(key, value) {
      if (value.length > failOver) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
}

const SCORES = [
  [100, 200, 300],
  [400, 0, 600],
  [700, 800, 900],
];
const row = (flags = ["ok", "ok", "ok"]) => ({
  scores: SCORES,
  flags,
  src: "blob:http://localhost/abc",
});
const ICON = "data:image/jpeg;base64,AAAA";
const ICONS = [
  [ICON, ICON, ICON],
  [ICON, null, ICON],
  null,
];

test("round-trips rows and icons, dropping object URLs", () => {
  const storage = createStorage();
  assert.equal(
    stashRehearsalHandoff({ rows: [row(), row()], icons: ICONS }, storage),
    true,
  );
  const taken = takeRehearsalHandoff(storage);
  assert.deepEqual(taken, {
    rows: [
      { scores: SCORES, flags: ["ok", "ok", "ok"] },
      { scores: SCORES, flags: ["ok", "ok", "ok"] },
    ],
    icons: ICONS,
    cell: null,
  });
  assert.equal(storage.values.has(REHEARSAL_HANDOFF_STORAGE_KEY), false);
  assert.equal(takeRehearsalHandoff(storage), null);
});

test("keeps flagged stages flagged", () => {
  const storage = createStorage();
  stashRehearsalHandoff({ rows: [row(["ok", "flagged", "ok"])] }, storage);
  assert.deepEqual(takeRehearsalHandoff(storage).rows[0].flags, [
    "ok",
    "flagged",
    "ok",
  ]);
});

test("the tool's selected index is the comparison's [stage, slot]", () => {
  const rows = [row()];
  assert.deepEqual(selectedToCell(rows, 0), [0, 0]);
  assert.deepEqual(selectedToCell(rows, 5), [1, 2]);
  assert.deepEqual(selectedToCell(rows, 7), [2, 1]);
  assert.equal(selectedToCell(rows, null), null);
  assert.equal(selectedToCell(rows, 9), null);
  // Stage 2's middle slot has no scores, so it can't be compared.
  assert.equal(selectedToCell(rows, 4), null);
  // A flagged stage is left out of the comparison, so its cells don't carry.
  assert.equal(selectedToCell([row(["ok", "ok", "flagged"])], 6), null);
});

test("carries the selected cell", () => {
  const storage = createStorage();
  stashRehearsalHandoff({ rows: [row()], icons: ICONS, selected: 5 }, storage);
  assert.deepEqual(takeRehearsalHandoff(storage).cell, [1, 2]);
});

test("stores nothing without rows", () => {
  const storage = createStorage();
  assert.equal(stashRehearsalHandoff({ rows: [] }, storage), false);
  assert.equal(encodeRehearsalHandoff({ rows: [{ scores: [[1]] }] }), null);
  assert.equal(storage.values.size, 0);
});

test("falls back to scores alone when the icons don't fit", () => {
  const storage = createStorage({}, { failOver: 150 });
  assert.equal(
    stashRehearsalHandoff({ rows: [row()], icons: ICONS }, storage),
    true,
  );
  const taken = takeRehearsalHandoff(storage);
  assert.equal(taken.icons, null);
  assert.equal(taken.rows.length, 1);
});

test("blocked or full storage doesn't throw", () => {
  const blocked = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("SecurityError");
    },
    removeItem() {},
  };
  assert.equal(stashRehearsalHandoff({ rows: [row()] }, blocked), false);
  assert.equal(takeRehearsalHandoff(blocked), null);
});

test("rejects malformed stored values", () => {
  assert.equal(decodeRehearsalHandoff(null), null);
  assert.equal(decodeRehearsalHandoff({ rows: "x" }), null);
  assert.equal(decodeRehearsalHandoff({ rows: [{ scores: "x" }] }), null);
  const decoded = decodeRehearsalHandoff({
    rows: [{ scores: SCORES, flags: ["bad"] }, { scores: [[1, 2]] }],
    icons: [["javascript:alert(1)", null, null], null, null],
    cell: [3, 0],
  });
  assert.deepEqual(decoded, {
    rows: [{ scores: SCORES, flags: ["ok", "ok", "ok"] }],
    icons: null,
    cell: null,
  });
  const storage = createStorage({ [REHEARSAL_HANDOFF_STORAGE_KEY]: "{oops" });
  assert.equal(takeRehearsalHandoff(storage), null);
  assert.equal(storage.values.size, 0);
});

test("keeps a flagged stage flagged beside a repaired one", () => {
  const storage = createStorage();
  stashRehearsalHandoff({ rows: [row(["repaired", "flagged", "ok"])] }, storage);
  assert.deepEqual(takeRehearsalHandoff(storage).rows[0].flags, [
    "repaired",
    "flagged",
    "ok",
  ]);
});

test("an unknown flag keeps its stage out", () => {
  const value = encodeRehearsalHandoff({ rows: [row(["ok", "odd", "ok"])] });
  assert.deepEqual(value.rows[0].flags, ["ok", "flagged", "ok"]);
});
