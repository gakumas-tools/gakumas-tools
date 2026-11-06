import { test } from "node:test";
import assert from "node:assert/strict";
import { exactFloor } from "../../../../gakumas-tools/utils/exactFloor.js";
import {
  calculateRatingExExamScore,
  calculateTargetScores,
} from "../../../../gakumas-tools/utils/produceRank.js";
import { calculateGainedVotes } from "../../../../gakumas-tools/utils/nia.js";

test("exactFloor floors whole products that floats land just below", () => {
  assert.equal(5400 * 2.3, 12419.999999999998);
  assert.equal(exactFloor(5400 * 2.3), 12420);
  assert.equal(exactFloor(50 * (1 + 16 / 100)), 58);
  assert.equal(exactFloor(12419.5), 12419);
  assert.equal(exactFloor(0), 0);
});

test("maxed master params rate 1800 * 3 * 2.3 = 12420", () => {
  // 1st place: 1700 for the place, plus floor(5400 * 2.3) for the params.
  const rating = calculateRatingExExamScore(
    1,
    [1800, 1800, 1800],
    1800,
    0,
    "master",
  );
  assert.equal(rating, 1700 + 12420);
  const ssPlus = calculateTargetScores(rating, "master").find(
    ({ rank }) => rank == "SS+",
  );
  assert.equal(ssPlus.score, 63000);
});

test("gained votes floor the affection bonus exactly", () => {
  const regimes = [{ threshold: 0, multiplier: 0, constant: 200 }];
  assert.equal(calculateGainedVotes(regimes, 13, 1), 230);
});
