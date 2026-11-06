import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTypeMultipliers, getParamCap } from "gakumas-engine";
import { findOptimalParams } from "../../../../gakumas-tools/utils/paramOptimizer.js";

function optimize({ stage, params, scoreByType, enterPercents = false }) {
  const typeMultipliers = calculateTypeMultipliers(
    params,
    stage,
    0,
    enterPercents
  );
  return findOptimalParams({
    scoreStats: { numRuns: 1, turns: [{ totalScoreByType: scoreByType }] },
    config: { stage, idol: { params, supportBonus: 0 }, typeMultipliers },
    enterPercents,
  });
}

const criteria = { vocal: 0.3, dance: 0.4, visual: 0.3 };

test("percentages can go past the contest param cap", () => {
  const params = { vocal: 4000, dance: 1000, visual: 1000 };
  const scoreByType = { vocal: 0, dance: 1000, visual: 0 };
  const cases = [
    { stage: { type: "event", season: 1, criteria } },
    { stage: { type: "contest", season: 1, criteria }, enterPercents: true },
  ];

  for (const { stage, enterPercents } of cases) {
    const result = optimize({ stage, params, scoreByType, enterPercents });
    assert.deepEqual(result.params, { vocal: 0, dance: 6000, visual: 0 });
    assert.equal(result.optimalScore, 6000);
  }
});

test("raw contest params stay within the season cap", () => {
  const params = { vocal: 1000, dance: 1000, visual: 1000 };
  const scoreByType = { vocal: 100, dance: 1000, visual: 100 };

  for (const season of [1, 25, 37, 55]) {
    const stage = { type: "contest", season, criteria };
    const result = optimize({ stage, params, scoreByType });
    const { vocal, dance, visual } = result.params;
    assert.equal(vocal + dance + visual, 3000);
    assert.ok(Math.max(vocal, dance, visual) <= getParamCap(season));
  }
});
