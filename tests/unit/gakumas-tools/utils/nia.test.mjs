import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAM_REGIMES_BY_DIFF_STAGE_BALANCE_ORDER,
  PARAM_ORDER_BY_IDOL,
  VOTE_REGIMES_BY_DIFF_STAGE,
  calculateBonusParams,
  calculateChallengeParams,
  calculateGainedParams,
  calculateGainedVotes,
  calculateMaxScores,
  calculatePostAuditionParams,
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

function postAuditionParams(regimes, maxParams, order, params, bonuses, challenge, scores) {
  const gained = calculateGainedParams(regimes, order, scores);
  const bonus = calculateBonusParams(gained, bonuses);
  const challengeParams = calculateChallengeParams(gained, bonus, challenge);
  return calculatePostAuditionParams(maxParams, params, gained, challengeParams, bonus);
}

test("max scores are the lowest scores that reach the param cap", () => {
  // Pro finale, idol 5: the old inverse stopped at 1999 Vi instead of 2000.
  const regimes = PARAM_REGIMES_BY_DIFF_STAGE_BALANCE_ORDER.pro.finale;
  const order = PARAM_ORDER_BY_IDOL[5];
  const params = [437, 900, 1946];
  const bonuses = [15, 22, 31];
  let reached = 0;
  for (const challenge of [0, 10]) {
    const maxScores = calculateMaxScores(regimes, 2000, order, params, bonuses, challenge);
    for (let i = 0; i < 3; i++) {
      const at = (score) => {
        const scores = [0, 0, 0];
        scores[i] = score;
        return postAuditionParams(regimes, 2000, order, params, bonuses, challenge, scores)[i];
      };
      if (at(1e9) < 2000) {
        // Unreachable: stop where this param's gains stop.
        assert.equal(maxScores[i], regimes[order[i]][0].threshold);
        continue;
      }
      reached++;
      assert.equal(at(maxScores[i]), 2000, `param ${i} challenge ${challenge}`);
      assert.ok(at(maxScores[i] - 1) < 2000, `param ${i} challenge ${challenge}`);
    }
  }
  assert.ok(reached > 0);
});

test("an already maxed param needs no score", () => {
  const regimes = PARAM_REGIMES_BY_DIFF_STAGE_BALANCE_ORDER.pro.finale;
  const maxScores = calculateMaxScores(regimes, 2000, [1, 2, 3], [2000, 0, 0], [0, 0, 0]);
  assert.equal(maxScores[0], 0);
});
