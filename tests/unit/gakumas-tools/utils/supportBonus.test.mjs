import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import { findStageCandidates } from "../../../../gakumas-tools/utils/supportBonus.js";

const bestStage = (...args) => findStageCandidates(...args)[0] ?? null;

const stageName = ({ stageId }) => {
  const stage = Stages.getById(stageId);
  return `${stage.season}-${stage.stage}`;
};

test("infers stage and support bonus from shown percents", () => {
  const result = bestStage([1184, 3313, 1816, 44], [902, 3015, 2314]);
  assert.equal(stageName(result), "42-3");
  assert.equal(result.supportBonus, 0.1524);
});

test("keeps the current stage when it fits", () => {
  const result = bestStage([1184, 3313, 1816, 44], [902, 3015, 2314], {
    currentStageId: 148,
  });
  assert.equal(result.stageId, 148);
});

test("prefers stages matching the loadout's plan", () => {
  const result = bestStage([1184, 3313, 1816, 44], [902, 3015, 2314], {
    plan: "sense",
    currentStageId: 150,
  });
  assert.equal(stageName(result), "42-1");
});

test("loosens the fit before giving up on the plan", () => {
  const result = bestStage([2179, 2783, 1311, 40], [2280, 3212, 978], {
    plan: "sense",
  });
  assert.equal(Stages.getById(result.stageId).plan, "sense");
});

test("lists every matching stage of the plan, best first", () => {
  const candidates = findStageCandidates(
    [923, 2610, 2552, 43],
    [728, 2373, 2990],
    { plan: "sense" },
  );
  assert.deepEqual(candidates.map(stageName), [
    "53-1",
    "50-1",
    "45-1",
    "43-1",
    "41-1",
  ]);
  assert.ok(
    candidates.every(({ stageId }) =>
      ["sense", "free"].includes(Stages.getById(stageId).plan),
    ),
  );
  const ids = candidates.map(({ stageId }) => stageId);
  assert.deepEqual(
    ids,
    [...ids].sort((a, b) => b - a),
  );
});

test("picks the newest stage regardless of array order", () => {
  const params = [923, 2610, 2552, 43];
  const multipliers = [728, 2373, 2990];
  const expected = stageName(bestStage(params, multipliers));
  const stages = Stages.getAll();
  const original = [...stages];
  stages.reverse();
  try {
    assert.equal(stageName(bestStage(params, multipliers)), expected);
  } finally {
    stages.splice(0, stages.length, ...original);
  }
});

test("allows a percent one off from fractional params", () => {
  const result = bestStage([865, 2348, 3060, 44], [683, 2547, 2814]);
  assert.equal(stageName(result), "42-3");
});

test("tolerates one misread percent", () => {
  const result = bestStage([1184, 3313, 1816, 44], [902, 3015, 2514]);
  assert.equal(stageName(result), "42-3");
  assert.ok(Math.abs(result.supportBonus - 0.1524) < 0.001);
});

test("returns null when no stage fits", () => {
  assert.equal(bestStage([1000, 1000, 1000, 40], [100, 9000, 100]), null);
});
