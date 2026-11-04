import { test } from "node:test";
import assert from "node:assert/strict";
import { PIdols } from "gakumas-data";
import {
  memoryPairLoadout,
  memoryPairs,
  pairedGain,
  rankMemoryPairs,
} from "../../../../gakumas-tools/utils/memoryPairs.js";

const pIdolOfPlan = (plan) => PIdols.getAll().find((p) => p.plan == plan).id;

const memory = (plan, params, extra = {}) => ({
  pIdolId: pIdolOfPlan(plan),
  params,
  pItemIds: [1],
  skillCardIds: [2, 3],
  ...extra,
});

const contest = { id: 1, type: "contest", plan: "sense" };

test("the main memory brings its P-items and full params, the sub a fifth", () => {
  const main = memory("sense", [1000, 500, 200, 30], { pItemIds: [7, 8] });
  const sub = memory("sense", [999, 401, 104, 32], { skillCardIds: [4] });
  const loadout = memoryPairLoadout(contest, main, sub, 0.1);
  assert.deepEqual(loadout.params, [1199, 580, 220, 36]);
  assert.deepEqual(loadout.pItemIds, [7, 8, 0, 0]);
  assert.deepEqual(loadout.skillCardIdGroups, [[2, 3], [4]]);
  assert.deepEqual(loadout.customizationGroups, [[{}, {}], [{}]]);
  assert.equal(loadout.supportBonus, 0.1);
  assert.equal(loadout.stageId, 1);
});

test("a link contest takes both memories' full params", () => {
  const link = { id: 2, type: "linkContest", plan: "free" };
  const a = memory("sense", [100, 200, 300, 10]);
  const b = memory("logic", [1, 2, 3, 4]);
  assert.deepEqual(memoryPairLoadout(link, a, b).params, [101, 202, 303, 14]);
});

test("only different memories of the stage's plan are paired", () => {
  const memories = [
    memory("sense", [1, 1, 1, 1]),
    memory("logic", [1, 1, 1, 1]),
    memory("sense", [1, 1, 1, 1]),
  ];
  assert.deepEqual(memoryPairs(contest, memories), [
    [0, 2],
    [2, 0],
  ]);
  assert.equal(memoryPairs({ ...contest, plan: "free" }, memories).length, 6);
});

test("paired gain has a 95% margin from the gains' spread", () => {
  const result = pairedGain([10, 20, 30, 40], [12, 21, 33, 44]);
  assert.equal(result.gain, 2.5);
  const sd = Math.sqrt((0.5 ** 2 * 2 + 1.5 ** 2 * 2) / 3);
  assert.ok(Math.abs(result.margin - (1.96 * sd) / 2) < 1e-12);
  assert.ok(Math.abs(result.lower - (2.5 - result.margin)) < 1e-12);
});

const memories = [
  memory("sense", [100, 0, 0, 0]),
  memory("sense", [200, 0, 0, 0]),
  memory("sense", [300, 0, 0, 0]),
];

function rank(score, baseline = [0, 1]) {
  return rankMemoryPairs({
    stage: contest,
    memories,
    baseline,
    selectionSeeds: [0, 1, 2],
    validationSeeds: [10, 11, 12],
    score,
  });
}

test("the best pair is recommended when its held-out gain is certain", async () => {
  const seen = [];
  const result = await rank(async (loadout, seed) => {
    seen.push(seed);
    return loadout.params[0] + seed;
  });
  assert.deepEqual(result.ranked[0].pair, [2, 1]);
  assert.deepEqual(result.recommended, [2, 1]);
  assert.equal(result.validation.baseline, 151);
  assert.equal(result.validation.best, 351);
  assert.equal(result.validation.gain, 200);
  assert.equal(result.validation.margin, 0);
  // Six pairs on the selection seeds, then baseline and best held out.
  assert.equal(seen.length, 6 * 3 + 2 * 3);
  assert.deepEqual(seen.slice(18), [10, 11, 12, 10, 11, 12]);
});

test("the baseline is kept when the held-out gain could be zero", async () => {
  // The best pair wins on selection seeds only: held out it is no better.
  const result = await rank(async (loadout, seed) =>
    seed < 10 ? loadout.params[0] : seed % 2 ? 0 : 100,
  );
  assert.deepEqual(result.ranked[0].pair, [2, 1]);
  assert.deepEqual(result.recommended, [0, 1]);
  assert.equal(result.validation.gain, 0);
});

test("the baseline is kept when it is the best pair", async () => {
  const result = await rank(async (loadout) => loadout.params[0], [2, 1]);
  assert.deepEqual(result.recommended, [2, 1]);
  assert.equal(result.validation.gain, 0);
});

test("a baseline the stage doesn't take is rejected", async () => {
  await assert.rejects(rank(async () => 0, [1, 1]), /baseline/);
  const mixed = [...memories, memory("logic", [1, 1, 1, 1])];
  await assert.rejects(
    rankMemoryPairs({
      stage: contest,
      memories: mixed,
      baseline: [3, 0],
      selectionSeeds: [0],
      validationSeeds: [1, 2],
      score: async () => 0,
    }),
    /baseline/,
  );
});
