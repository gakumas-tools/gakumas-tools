import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateIdolRoadPercents, calculateTypeMultipliers } from "gakumas-engine";
import { IdolRoad, Stages } from "gakumas-data";

// Score bonus % read from the in-game contest formation panel, season 55
// (ver 3.5.0, 2026-11-04), support bonus +0.11%. A rehearsal's 詳細ログ shows
// the same % and scores with them.
const SUPPORT_BONUS = 0.0011;
const STAGES = {
  1: { type: "contest", season: 55, criteria: { vocal: 0.35, dance: 0.2, visual: 0.45 } },
  2: { type: "contest", season: 55, criteria: { vocal: 0.45, dance: 0.2, visual: 0.35 } },
  3: { type: "contest", season: 55, criteria: { vocal: 0.2, dance: 0.45, visual: 0.35 } },
};

function percents(stage, [vocal, dance, visual]) {
  const m = calculateTypeMultipliers({ vocal, dance, visual }, STAGES[stage], SUPPORT_BONUS);
  return [m.vocal, m.dance, m.visual].map((x) => Math.round(x * 100));
}

test("season 55 bonus is the full curve when every param meets 900 × its criterion", () => {
  assert.deepEqual(percents(1, [343, 434, 499]), [462, 362, 775]);
  assert.deepEqual(percents(1, [894, 363, 405]), [1041, 319, 648]);
});

test("season 55 bonus shrinks for each param below 900 × its criterion", () => {
  // one param short (visual 327 < 405)
  assert.deepEqual(percents(1, [724, 378, 327]), [765, 299, 487]);
  // one short, dance over 900 (predicted before reading the game)
  assert.deepEqual(percents(1, [281, 990, 367]), [330, 554, 485]);
  // two short (vocal 225 < 315, visual 300 < 405)
  assert.deepEqual(percents(1, [225, 834, 300]), [272, 463, 394]);
  // stage 2: vocal 237 < 405
  assert.deepEqual(percents(2, [237, 589, 560]), [370, 398, 595]);
  // stage 3: dance 200 < 405
  assert.deepEqual(percents(3, [300, 200, 400]), [250, 324, 448]);
  // stage 3, all three short: the rehearsal's default memory 学園生活 雨夜燕
  // (2026-11-05, predicted before reading the game)
  assert.deepEqual(percents(3, [100, 100, 100]), [127, 158, 146]);
});

// Idol Road stage score bonus %, read from the in-game formation panel for
// 27 花海咲季 memories as Main on each of stages 1–6 (2026-11-23). Each row:
// stageId, the memory's Vo/Da/Vi, the three % the stage showed.
const IDOL_ROAD_READINGS = readFileSync(
  new URL("../../fixtures/idolRoadPercents.tsv", import.meta.url),
  "utf8",
)
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => line.split("\t").map(Number));

const SAKI_P_IDOL_ID = 41; // 初声

test("Idol Road stage % come from the stage's curve and params", () => {
  assert.equal(IDOL_ROAD_READINGS.length, 169);
  for (const [stageId, vocal, dance, visual, ...shown] of IDOL_ROAD_READINGS) {
    const stage = IdolRoad.resolveStage(Stages.getById(stageId), SAKI_P_IDOL_ID);
    const percents = calculateIdolRoadPercents({ vocal, dance, visual }, stage.scoreCurve);
    assert.deepEqual(
      [percents.vocal, percents.dance, percents.visual],
      shown,
      `stage ${stageId} at ${vocal}/${dance}/${visual}`,
    );
  }
});

test("Idol Road % shrink for each param below the stage's threshold", () => {
  const stage = IdolRoad.resolveStage(Stages.getById(196), SAKI_P_IDOL_ID);
  // every param at or above 288/352/426: the curve alone
  assert.deepEqual(
    calculateIdolRoadPercents({ vocal: 401, dance: 585, visual: 1500 }, stage.scoreCurve),
    { vocal: 755, dance: 953, visual: 1985 },
  );
  // vocal 279 < 288 only, then vocal and dance 318 < 352 as well
  assert.deepEqual(
    calculateIdolRoadPercents({ vocal: 279, dance: 521, visual: 1329 }, stage.scoreCurve),
    { vocal: 427, dance: 808, visual: 1664 },
  );
  assert.deepEqual(
    calculateIdolRoadPercents({ vocal: 279, dance: 318, visual: 1461 }, stage.scoreCurve),
    { vocal: 385, dance: 450, visual: 1552 },
  );
});

test("Idol Road % are null without a curve or past its last point", () => {
  const stage = IdolRoad.resolveStage(Stages.getById(196), SAKI_P_IDOL_ID);
  assert.equal(calculateIdolRoadPercents({ vocal: 500, dance: 500, visual: 500 }, undefined), null);
  assert.equal(
    calculateIdolRoadPercents({ vocal: 500, dance: 500, visual: 2000 }, stage.scoreCurve),
    null,
  );
  // another idol on the same stage has no curve yet
  const other = IdolRoad.resolveStage(Stages.getById(196), 2);
  assert.equal(other.scoreCurve, undefined);
});
