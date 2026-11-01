import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOTE_REGIMES_BY_DIFF_STAGE,
  calculateGainedVotes,
  calculateScoreForVotes,
} from "../../../../gakumas-tools/utils/nia.js";

test("score for votes is the lowest score that gains them", () => {
  for (const stages of Object.values(VOTE_REGIMES_BY_DIFF_STAGE)) {
    for (const regimes of Object.values(stages)) {
      for (const affection of [10, 15, 20]) {
        for (const votes of [500, 5000, 20000, 30000, 40000]) {
          const score = calculateScoreForVotes(regimes, affection, votes);
          if (score == Infinity) continue;
          assert.ok(score > 0);
          assert.ok(calculateGainedVotes(regimes, affection, score) >= votes);
          assert.ok(calculateGainedVotes(regimes, affection, score - 1) < votes);
        }
      }
    }
  }
});

test("score for votes at high affection is reachable, not negative", () => {
  // Master finale at affection 20 gains 36223 votes from a 300000 score.
  const regimes = VOTE_REGIMES_BY_DIFF_STAGE.master.finale;
  const score = calculateScoreForVotes(regimes, 20, 30000);
  assert.ok(score > 0 && score <= 300000, `score ${score}`);
});

test("votes beyond the cap need an unreachable score", () => {
  const regimes = VOTE_REGIMES_BY_DIFF_STAGE.master.finale;
  const cap = calculateGainedVotes(regimes, 10, 1e9);
  assert.equal(calculateScoreForVotes(regimes, 10, cap + 1), Infinity);
});
