import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARGET_RATING_BY_RANK,
  calculateActualRating,
  calculateTargetScores,
  getRank,
} from "../../../../gakumas-tools/utils/produceRank.js";

test("final exam rating meets each regime at its breakpoint", () => {
  const rating = (score, difficulty) =>
    calculateActualRating(score, 0, difficulty);
  for (const [score, expected] of [
    [5000, 1500],
    [10000, 2250],
    [20000, 3050],
    [30000, 3450],
    [40000, 3650],
  ]) {
    assert.equal(rating(score, "master"), expected, `master ${score}`);
  }
  for (const [score, expected] of [
    [300000, 4500],
    [500000, 6500],
    [600000, 7300],
    [2000000, 8700],
    [3000000, 8700],
  ]) {
    assert.equal(rating(score, "legend"), expected, `legend ${score}`);
  }
});

test("each target score is the lowest score that reaches its rank", () => {
  for (const difficulty of ["master", "legend"]) {
    for (let base = 0; base <= 36000; base += 97) {
      for (const { rank, score } of calculateTargetScores(base, difficulty)) {
        const target = TARGET_RATING_BY_RANK[rank];
        const label = `${difficulty} ${base} ${rank}`;
        if (!Number.isFinite(score)) {
          assert.ok(
            calculateActualRating(1e9, base, difficulty) < target,
            label,
          );
          continue;
        }
        assert.ok(
          calculateActualRating(score, base, difficulty) >= target,
          label,
        );
        if (score > 0) {
          assert.ok(
            calculateActualRating(score - 1, base, difficulty) < target,
            label,
          );
        } else {
          assert.ok(base >= target, label);
        }
      }
    }
  }
});

test("ranks change exactly at their ratings", () => {
  const ranks = Object.keys(TARGET_RATING_BY_RANK);
  ranks.forEach((rank, i) => {
    const rating = TARGET_RATING_BY_RANK[rank];
    assert.equal(getRank(rating), rank);
    assert.equal(getRank(rating - 1), ranks[i + 1] ?? null);
  });
});
