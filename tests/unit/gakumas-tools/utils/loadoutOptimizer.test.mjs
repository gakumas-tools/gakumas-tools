import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareLoadoutCandidates,
  loadoutStageConfig,
  paramLayouts,
} from "../../../../gakumas-tools/utils/loadoutOptimizer.js";

const loadout = (card) => ({
  stageId: 1,
  params: [100, 200, 300, 50],
  pItemIds: [],
  skillCardIdGroups: [[card]],
  customizationGroups: [[{}]],
});

const card = (loadout) => loadout.skillCardIdGroups[0][0];

const comparison = (options) => ({
  baseline: { id: "baseline", loadout: loadout(1) },
  candidates: [{ id: "candidate", loadout: loadout(2) }],
  evaluate: async (loadout) => card(loadout) * 10,
  runs: 2,
  validationRuns: 30,
  seed: 100,
  ...options,
});

test("validation replays the winner and the baseline on fresh shared seeds", async () => {
  const calls = [];
  const result = await compareLoadoutCandidates(
    comparison({
      evaluate: async (loadout, seed) => {
        calls.push(seed);
        return card(loadout) * 10;
      },
    }),
  );
  assert.equal(result.selectedId, "candidate");
  assert.equal(result.accepted, true);
  assert.equal(result.validation.meanGain, 10);
  assert.equal(result.validation.margin, 0);
  assert.deepEqual(calls.slice(0, 4), [100, 101, 100, 101]);
  assert.deepEqual(calls.slice(4, 8), [102, 102, 103, 103]);
});

test("a winner on the selection seeds that loses validation is not kept", async () => {
  const result = await compareLoadoutCandidates(
    comparison({
      evaluate: async (loadout, seed) =>
        card(loadout) == 1 ? 100 : seed < 102 ? 200 : 90,
    }),
  );
  assert.equal(result.candidateId, "candidate");
  assert.equal(result.selectedId, "baseline");
  assert.equal(result.validation.meanGain, -10);
});

test("a gain whose interval reaches below minGain keeps the baseline", async () => {
  const noisy = await compareLoadoutCandidates(
    comparison({
      evaluate: async (loadout, seed) =>
        card(loadout) == 1 ? 100 : seed < 102 || seed % 2 ? 200 : 10,
    }),
  );
  assert.ok(noisy.validation.meanGain > 0);
  assert.ok(noisy.validation.lowerGain < 0);
  assert.equal(noisy.selectedId, "baseline");

  const small = await compareLoadoutCandidates(comparison({ minGain: 10 }));
  assert.equal(small.selectedId, "baseline");
});

test("a tie keeps the baseline without validation runs", async () => {
  let calls = 0;
  const result = await compareLoadoutCandidates(
    comparison({
      evaluate: async () => {
        calls++;
        return 100;
      },
    }),
  );
  assert.equal(result.selectedId, "baseline");
  assert.equal(result.validation, null);
  assert.equal(calls, 4);
});

test("validation seeds wrap past 2^32 without reusing selection seeds", async () => {
  const seeds = new Set();
  const result = await compareLoadoutCandidates(
    comparison({
      seed: 0xffffffff,
      evaluate: async (loadout, seed) => {
        seeds.add(seed);
        return card(loadout) * 10;
      },
    }),
  );
  assert.equal(result.validationSeed, 1);
  assert.equal(seeds.size, 32);
});

test("Vo/Da/Vi totals that differ only by float rounding are the same budget", async () => {
  const options = comparison();
  options.baseline.loadout.params = [0.1, 0.2, 0, 50];
  options.candidates[0].loadout.params = [0.3, 0, 0, 50];
  const result = await compareLoadoutCandidates(options);
  assert.equal(result.selectedId, "candidate");
});

test("bad options and candidates are refused before any scoring", async () => {
  let scored = 0;
  const evaluate = async () => {
    scored++;
    return 0;
  };
  const other = (patch) => [
    { id: "other", loadout: { ...loadout(2), ...patch } },
  ];
  for (const options of [
    { runs: 0 },
    { runs: 1001 },
    { runs: 1.5 },
    { validationRuns: 29 },
    { validationRuns: 1001 },
    { seed: -1 },
    { seed: 2 ** 32 },
    { minGain: -1 },
    {
      candidates: Array.from({ length: 32 }, (_, i) => ({
        id: String(i),
        loadout: loadout(2),
      })),
    },
    { candidates: [{ id: "baseline", loadout: loadout(2) }] },
    { candidates: other({ stageId: 2 }) },
    { candidates: other({ params: [100, 200, 400, 50] }) },
  ]) {
    await assert.rejects(
      compareLoadoutCandidates(comparison({ ...options, evaluate })),
    );
  }
  assert.equal(scored, 0);
});

test("a score that isn't a number, or a failing evaluator, ends the comparison", async () => {
  await assert.rejects(
    compareLoadoutCandidates(comparison({ evaluate: async () => NaN })),
    /scored NaN/,
  );
  await assert.rejects(
    compareLoadoutCandidates(
      comparison({
        evaluate: async () => {
          throw new Error("failed");
        },
      }),
    ),
    /failed/,
  );
});

test("paramLayouts gives each other Vo/Da/Vi order once and keeps stamina", () => {
  assert.equal(paramLayouts([100, 200, 300, 50]).length, 5);
  assert.deepEqual(paramLayouts([100, 100, 200, 50]), [
    [100, 200, 100, 50],
    [200, 100, 100, 50],
  ]);
  assert.deepEqual(paramLayouts([100, 100, 100, 50]), []);
});

test("loadoutStageConfig refuses unknown ids, link stages and the wrong plan", () => {
  assert.ok(loadoutStageConfig(loadout(1), false));
  for (const patch of [
    { stageId: 999999 },
    { stageId: 121 },
    { pItemIds: [999999] },
    { skillCardIdGroups: [[999999]] },
    // Stage 3 is logic; card 182 is a sense idol's.
    { stageId: 3, skillCardIdGroups: [[182]] },
  ]) {
    assert.throws(() => loadoutStageConfig({ ...loadout(1), ...patch }, false));
  }
});
