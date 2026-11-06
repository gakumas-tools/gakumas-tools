import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTypeMultipliers } from "gakumas-engine";

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
