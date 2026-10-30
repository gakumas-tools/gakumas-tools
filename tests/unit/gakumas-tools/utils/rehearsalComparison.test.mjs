import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketShares,
  cellScores,
  compareScores,
  likelyMisPick,
  rehearsalGrid,
  validateComparison,
} from "../../../../gakumas-tools/utils/rehearsalComparison.js";

const row = (scores, flags = ["ok", "ok", "ok"]) => ({ scores, flags });

test("cellScores reads one stage/slot and skips flagged stages and zeros", () => {
  const rows = [
    row([[10, 20, 30], [40, 50, 60], [70, 80, 90]]),
    row([[11, 0, 31], [41, 51, 61], [71, 81, 91]]),
    row([[12, 22, 32], [42, 52, 62], [72, 82, 92]], ["ok", "flagged", "ok"]),
  ];
  assert.deepEqual(cellScores(rows, 0, 1), [20, 22]);
  assert.deepEqual(cellScores(rows, 1, 2), [60, 61]);
});

test("compareScores reports the simulator's gap relative to rehearsal", () => {
  const result = compareScores([110, 110], [90, 100, 110]);
  assert.equal(result.n, 3);
  assert.equal(result.simMean, 110);
  assert.equal(result.rehearsalMean, 100);
  assert.ok(Math.abs(result.diffPct - 0.1) < 1e-9);
  assert.ok(Math.abs(result.marginPct - (1.96 * 10) / Math.sqrt(3) / 100) < 1e-9);
});

test("compareScores has no margin from a single rehearsal", () => {
  assert.equal(compareScores([100], [90]).marginPct, null);
  assert.equal(compareScores([100], []), null);
});

const valid = {
  id: "0b6c7f6e-8a4f-4c55-9a43-6f1f3f1f2a10",
  loadout: {
    stageId: 148,
    params: [1, 2, 3, 4],
    pItemIds: [0],
    skillCardIdGroups: [[0]],
    customizationGroups: [[{}]],
    extra: "dropped",
  },
  enterPercents: false,
  simStats: {
    count: 2000,
    min: 30000,
    q1: 38000,
    median: 41000,
    mean: 41000,
    q3: 44000,
    max: 52000,
    stddev: 4000,
    bucketMin: 30000,
    bucketSize: 550,
    buckets: [1, 5, 9],
  },
  rehearsal: {
    stage: 2,
    slot: 1,
    grid: [
      [[30000], [31000], []],
      [[40000, 42000], [20000], []],
      [[50000], [], []],
    ],
  },
};

test("validateComparison keeps known fields only", () => {
  const { comparison, error } = validateComparison({
    ...valid,
    simStats: { ...valid.simStats, extra: { nested: "x" } },
  });
  assert.equal(error, undefined);
  assert.equal(comparison._id, valid.id);
  assert.equal(comparison.loadout.extra, undefined);
  assert.equal(comparison.simStats.extra, undefined);
  assert.deepEqual(comparison.loadout.params, [1, 2, 3, 4]);
  assert.deepEqual(comparison.rehearsal.scores, [40000, 42000]);
  assert.equal(comparison.rehearsal.grid.length, 3);
});

test("validateComparison rejects bad input", () => {
  const bad = [
    null,
    { ...valid, id: "nope" },
    { ...valid, loadout: { stageId: "custom" } },
    { ...valid, rehearsal: { ...valid.rehearsal, slot: 4 } },
    { ...valid, rehearsal: { ...valid.rehearsal, slot: 3 } },
    { ...valid, rehearsal: { ...valid.rehearsal, grid: [[[1.5]]] } },
    {
      ...valid,
      rehearsal: {
        ...valid.rehearsal,
        grid: valid.rehearsal.grid.with(0, [[1.5], [], []]),
      },
    },
    { ...valid, simStats: null },
    { ...valid, simStats: { ...valid.simStats, mean: "41000" } },
    { ...valid, simStats: { ...valid.simStats, buckets: [{}] } },
  ];
  for (const body of bad) assert.ok(validateComparison(body).error);
});

test("validateComparison accepts loadouts shaped like the editor's", () => {
  const loadout = {
    stageId: 148,
    customStage: {},
    supportBonus: 0.042,
    params: [1500, null, 900, 50],
    pItemIds: [1, 0, 0, 0],
    skillCardIdGroups: [
      [10, 20, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    customizationGroups: [[{ 3: 1 }, null, [], {}, {}, {}], []],
  };
  const { comparison, error } = validateComparison({ ...valid, loadout });
  assert.equal(error, undefined);
  assert.deepEqual(comparison.loadout.params, loadout.params);
  assert.deepEqual(
    comparison.loadout.customizationGroups,
    loadout.customizationGroups,
  );
  const { customizationGroups, ...beforeCustomizations } = loadout;
  assert.equal(
    validateComparison({ ...valid, loadout: beforeCustomizations }).error,
    undefined,
  );
});

test("validateComparison rejects malformed loadout fields", () => {
  const big = (n, v) => new Array(n).fill(v);
  const bad = [
    { stageId: "148" },
    { supportBonus: "0.1" },
    { params: ["1500", 0, 0, 0] },
    { params: [{ nested: "x" }] },
    { params: big(5, 0) },
    { pItemIds: "0-0-0-0" },
    { pItemIds: [1.5] },
    { pItemIds: big(21, 0) },
    { skillCardIdGroups: [1, 2, 3] },
    { skillCardIdGroups: { 0: [1] } },
    { skillCardIdGroups: big(11, [0]) },
    { skillCardIdGroups: [big(21, 0)] },
    { customizationGroups: [{ 3: 1 }] },
    { customizationGroups: [[{ 3: "x".repeat(1000) }]] },
    { customizationGroups: [[{ 3: { deep: 1 } }]] },
    { customizationGroups: [[Object.fromEntries(big(21, 0).map((_, i) => [i, 1]))]] },
    { customizationGroups: big(11, []) },
    { customizationGroups: [[{ ["x".repeat(1000)]: 1 }]] },
  ];
  for (const fields of bad) {
    const body = { ...valid, loadout: { ...valid.loadout, ...fields } };
    assert.ok(validateComparison(body).error, JSON.stringify(fields).slice(0, 80));
  }
});

test("bucketShares puts both groups on shared buckets as percentages", () => {
  const { labels, bucketSize, shares } = bucketShares([
    [1000, 1500, 2400, 2600],
    [2500, 2900],
  ]);
  assert.equal(bucketSize, 100);
  assert.equal(labels[0], 1000);
  assert.equal(labels.at(-1), 2900);
  assert.equal(shares[0].length, labels.length);
  assert.equal(shares[0][0], 25);
  assert.equal(shares[1][labels.indexOf(2500)], 50);
  for (const s of shares) {
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  }
});

test("rehearsalGrid is stage-major", () => {
  const grid = rehearsalGrid([row([[1, 2, 3], [4, 5, 6], [7, 8, 9]])]);
  assert.deepEqual(grid, [
    [[1], [2], [3]],
    [[4], [5], [6]],
    [[7], [8], [9]],
  ]);
});

test("likelyMisPick points at a far better matching cell", () => {
  const grid = [
    [[100], [50], [20]],
    [[60], [70], [80]],
    [[10], [11], [12]],
  ];
  assert.deepEqual(likelyMisPick(100, grid, 3, 1), {
    stage: 1,
    slot: 1,
    gap: 0,
  });
  assert.equal(likelyMisPick(100, grid, 1, 1), null);
  assert.equal(likelyMisPick(90, grid, 1, 1), null);
});
