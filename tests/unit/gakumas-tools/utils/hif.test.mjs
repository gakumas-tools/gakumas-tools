import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROUND2_SCORE,
  TARGET_RATING_BY_RANK,
  calculateTargetRound2Scores,
  calculateTotalRating,
  getBoostedRound2StarGain,
  getRound1Rating,
  getRound2Rating,
  getStarGainFromRound2,
} from "../../../../gakumas-tools/utils/hif.js";

test("round ratings and star gain meet each regime at its breakpoint", () => {
  for (const [score, expected] of [
    [300000, 0],
    [700000, 4000],
    [1000000, 4900],
    [1200000, 5300],
    [1400000, 5500],
    [2000000, 5500],
  ]) {
    assert.equal(getRound1Rating(score * 1.2), expected, `round 1 ${score}`);
  }
  for (const [score, expected] of [
    [600000, 0],
    [900000, 1200],
    [1500000, 6000],
    [2000000, 7000],
    [2400000, 7400],
    [3000000, 7400],
  ]) {
    assert.equal(getRound2Rating(score), expected, `round 2 ${score}`);
  }
  for (const [score, expected, boosted] of [
    [400000, 75, 112],
    [600000, 120, 180],
    [1000000, 150, 225],
    [2000000, 150, 225],
  ]) {
    assert.equal(getStarGainFromRound2(score), expected, `star ${score}`);
    assert.equal(getBoostedRound2StarGain(score), boosted, `boost ${score}`);
  }
});

const RUNS = [
  {
    params: [2400, 2200, 2000],
    preRound2Star: 600,
    round1Score: 900000,
  },
  {
    params: [3200, 3200, 3200],
    preRound2Star: 1110,
    round1Score: 1680000,
  },
  {
    params: [1000, 800, 600],
    preRound2Star: 100,
    round1Score: 0,
  },
];

test("each round 2 target is the lowest score that reaches its rank", () => {
  for (const run of RUNS) {
    const rating = (round2Score) =>
      calculateTotalRating({ ...run, round2Score });
    for (const { rank, score } of calculateTargetRound2Scores(run)) {
      const target = TARGET_RATING_BY_RANK[rank];
      const label = `${run.params} ${rank}`;
      if (score == null) {
        assert.ok(rating(MAX_ROUND2_SCORE) < target, label);
      } else if (score == 0) {
        assert.ok(rating(0) >= target, label);
      } else {
        assert.ok(rating(score) >= target, label);
        assert.ok(rating(score - 1) < target, label);
      }
    }
  }
});

test("ranks the current round 2 score already reaches need 0 more", () => {
  const run = { ...RUNS[0], currentRound2Score: 2400000 };
  const rating = calculateTotalRating({ ...run, round2Score: 2400000 });
  for (const { rank, score } of calculateTargetRound2Scores(run)) {
    if (rating >= TARGET_RATING_BY_RANK[rank]) assert.equal(score, 0, rank);
  }
});
