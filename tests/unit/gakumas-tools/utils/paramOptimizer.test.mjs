import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTypeMultipliers } from "gakumas-engine";
import {
  canOptimizeParams,
  findOptimalParams,
} from "../../../../gakumas-tools/utils/paramOptimizer.js";

const CONTEST_STAGE = {
  type: "contest",
  season: 40,
  criteria: { vocal: 0.4, dance: 0.3, visual: 0.3 },
};

function makeRun(stage, params) {
  const typeMultipliers = calculateTypeMultipliers(params, stage, 0);
  return {
    scoreStats: {
      numRuns: 1,
      turns: [{ totalScoreByType: { vocal: 3000, dance: 1000, visual: 1000 } }],
    },
    config: { stage, idol: { params, supportBonus: 0 }, typeMultipliers },
  };
}

test("redistributes contest params within their total", () => {
  const params = { vocal: 1000, dance: 1600, visual: 1600 };
  const result = findOptimalParams(makeRun(CONTEST_STAGE, params));
  const { vocal, dance, visual } = result.params;
  assert.equal(vocal + dance + visual, 4200);
  assert.ok(vocal > params.vocal);
  assert.ok(result.optimalScore > result.baseScore);
});

test("doesn't offer to redistribute params entered as percents", () => {
  assert.equal(canOptimizeParams(CONTEST_STAGE, true), false);
});

test("doesn't offer to redistribute a non-contest stage's percents", () => {
  assert.equal(canOptimizeParams({ type: "event", season: 40 }), false);
});
