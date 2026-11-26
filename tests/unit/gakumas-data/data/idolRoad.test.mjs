import { test } from "node:test";
import assert from "node:assert/strict";
import { IdolRoad, PIdols, Stages } from "gakumas-data";
import { createIdolRoad } from "gakumas-data/data/idolRoad";

// Made-up rows for the resolver's own logic. They are not game data:
// captured stages replay in tests/idolRoadFidelity.mjs.
const STAGE_ROWS = [
  {
    stageId: 900,
    idolId: 2,
    criteria: "0.5,0.3,0.2",
    turnCounts: "6,5,4",
    firstTurns: "0,1,0",
  },
];
const EFFECT_ROWS = [
  {
    stageId: 900,
    recommendedEffect: "concentration",
    effects: "at:startOfTurn { score+=1; limit:1 }",
  },
];

const stage = {
  id: 900,
  type: "idolRoad",
  plan: "free",
  criteria: { vocal: 0.34, dance: 0.33, visual: 0.33 },
  turnCounts: { vocal: 4, dance: 4, visual: 4 },
  firstTurns: { vocal: 0.34, dance: 0.33, visual: 0.33 },
  effects: [{ phase: "endOfTurn", actions: [] }],
};

// Pattern A is idols 1 and 2, pattern B idol 3; stage 902 is shared.
// Rows come in any order: 902 is STAGE 2, after 900 and 901 (STAGE 1).
const PATTERN_ROWS = [
  { pattern: "A", idolIds: "1,2" },
  { pattern: "B", idolIds: 3 },
];
const PATTERN_STAGE_ROWS = [
  { stageId: 902, pattern: "A" },
  { stageId: 900, pattern: "A" },
  { stageId: 901, pattern: "B" },
  { stageId: 902, pattern: "B" },
];
const STAGE_NUMBERS = { 900: 1, 901: 1, 902: 2 };

const idolRoad = createIdolRoad(
  STAGE_ROWS,
  EFFECT_ROWS,
  PATTERN_ROWS,
  PATTERN_STAGE_ROWS,
  (id) => STAGE_NUMBERS[id],
);

test("an Idol Road stage takes the P-idol's idol row, plan and 応援効果", () => {
  // P-idol 2 is idol 2, sense, recommended effect concentration.
  const resolved = idolRoad.resolveStage(stage, 2);
  assert.equal(resolved.pIdolId, 2);
  assert.equal(resolved.plan, "sense");
  assert.deepEqual(resolved.criteria, { vocal: 0.5, dance: 0.3, visual: 0.2 });
  assert.deepEqual(resolved.turnCounts, { vocal: 6, dance: 5, visual: 4 });
  assert.deepEqual(resolved.firstTurns, { vocal: 0, dance: 1, visual: 0 });
  // Stage-wide effects first, then the recommended effect's.
  assert.equal(resolved.effects.length, 2);
  assert.equal(resolved.effects[0], stage.effects[0]);
  assert.equal(resolved.effects[1].phase, "startOfTurn");
  // The stage row itself is left alone.
  assert.equal(stage.plan, "free");
  assert.equal(stage.effects.length, 1);
});

test("an idol or recommended effect with no row keeps the stage's values", () => {
  // P-idol 1 is idol 1, sense, goodConditionTurns: no rows for either.
  const resolved = idolRoad.resolveStage(stage, 1);
  assert.equal(resolved.plan, "sense");
  assert.equal(resolved.criteria, stage.criteria);
  assert.equal(resolved.turnCounts, stage.turnCounts);
  assert.equal(resolved.effects, stage.effects);
});

test("each P-idol's road lists its own pattern's stages", () => {
  // P-idol 2 is idol 2 (pattern A); a P-idol of idol 3 is on pattern B.
  const pIdolB = PIdols.getAll().find((p) => p.idolId == 3);
  assert.equal(idolRoad.getPattern(2), "A");
  assert.deepEqual(idolRoad.getStageIds(2), [900, 902]);
  assert.equal(idolRoad.getPattern(pIdolB.id), "B");
  assert.deepEqual(idolRoad.getStageIds(pIdolB.id), [901, 902]);
});

test("an idol on no pattern, or an unknown P-idol, has no road list", () => {
  const pIdol = PIdols.getAll().find((p) => p.idolId == 12);
  assert.equal(idolRoad.getPattern(pIdol.id), null);
  assert.equal(idolRoad.getStageIds(pIdol.id), null);
  assert.equal(idolRoad.getStageIds(999999), null);
});

test("other stage types and unknown P-idols come back unchanged", () => {
  const contest = { ...stage, type: "contest" };
  assert.equal(idolRoad.resolveStage(contest, 2), contest);
  assert.equal(idolRoad.resolveStage(stage, 999999), stage);
  assert.equal(idolRoad.resolveStage(stage, undefined), stage);
});

test("the shipped tables put each idol on the road the game gives it", () => {
  // Pattern A: 咲季 手毬 千奈 清夏 莉波. Pattern B: ことね 麻央 リーリヤ 広
  // 佑芽 星南, and 美鈴 (her STAGE 1 is 8 turns, STAGE 2 14, on the
  // account). 燕 isn't known yet.
  const byIdol = (idolId) =>
    IdolRoad.getPattern(PIdols.getAll().find((p) => p.idolId == idolId).id);
  assert.deepEqual([1, 2, 6, 7, 9].map(byIdol), ["A", "A", "A", "A", "A"]);
  assert.deepEqual(
    [3, 4, 5, 8, 10, 11, 12].map(byIdol),
    ["B", "B", "B", "B", "B", "B", "B"],
  );
  assert.equal(byIdol(13), null);
  // 咲季's STAGE 1-5 are pattern A's first five.
  assert.deepEqual(
    IdolRoad.getStageIds(1).slice(0, 5),
    [196, 197, 198, 199, 200],
  );
});

test("the shipped tables have no rows for a made-up stage", () => {
  // Rows wait for in-game captures; until then resolution only sets the plan.
  const resolved = IdolRoad.resolveStage(stage, 2);
  assert.equal(resolved.plan, "sense");
  assert.equal(resolved.criteria, stage.criteria);
  assert.equal(resolved.effects, stage.effects);
});

test("getMissingData names the rows a P-idol's stage lacks", () => {
  // P-idol 2 (idol 2, concentration) has both rows.
  assert.equal(idolRoad.getMissingData(stage, 2), null);
  // P-idol 1 (idol 1, goodConditionTurns) has neither.
  assert.deepEqual(idolRoad.getMissingData(stage, 1), {
    recommendedEffect: "goodConditionTurns",
    supportEffects: true,
    idolRow: true,
  });
});

test("getMissingData has nothing for other stage types or unknown P-idols", () => {
  assert.equal(idolRoad.getMissingData({ ...stage, type: "contest" }, 1), null);
  assert.equal(idolRoad.getMissingData(stage, 999999), null);
  assert.equal(idolRoad.getMissingData(stage, undefined), null);
  assert.equal(idolRoad.getMissingData(null, 1), null);
});

test("getMissingData on the shipped tables: STAGE 10 by おすすめ効果", () => {
  const stage10 = Stages.getById(207);
  assert.equal(stage10.type, "idolRoad");
  // P-idol 130 (好印象) has its 応援効果 row and its idol's row.
  assert.equal(IdolRoad.getMissingData(stage10, 130), null);
  // P-idol 159 (やる気) and 148 (強気) have no 応援効果 row yet.
  assert.deepEqual(IdolRoad.getMissingData(stage10, 159), {
    recommendedEffect: "motivation",
    supportEffects: true,
    idolRow: false,
  });
  assert.deepEqual(IdolRoad.getMissingData(stage10, 148), {
    recommendedEffect: "strength",
    supportEffects: true,
    idolRow: false,
  });
  // resolveStage still runs them, without the 応援効果.
  assert.equal(
    IdolRoad.resolveStage(stage10, 159).effects,
    stage10.effects,
  );
});

test("美鈴's 温存 P-idols enter Idol Road as the おすすめ効果 their memory shows", () => {
  // The formation screen shows 学園生活 as 全力 and ゆっくり、一歩ずつ as
  // 強気; Idol Road has no 温存 branch.
  const stage = Stages.getById(208);
  const missing = (pIdolId) =>
    IdolRoad.getMissingData(stage, pIdolId)?.recommendedEffect ?? null;
  assert.equal(PIdols.getById(91).recommendedEffect, "preservation");
  assert.equal(missing(91), null);
  assert.equal(missing(92), null);
  const effects = (pIdolId) => IdolRoad.resolveStage(stage, pIdolId).effects;
  assert.notDeepEqual(effects(91), effects(92));
  // ツキノカメ's hasn't been seen: it keeps its own and finds no row.
  assert.equal(missing(93), "preservation");
});

test("a P-idol effect row picks the 応援/トラブル its branch has", () => {
  const road = createIdolRoad(STAGE_ROWS, [
    ...EFFECT_ROWS,
    { stageId: 900, recommendedEffect: "strength", effects: "at:startOfTurn { score+=2; limit:1 }" },
  ], [], [], undefined, [{ pIdolId: 2, recommendedEffect: "strength" }]);
  const resolved = road.resolveStage(stage, 2);
  const solo = createIdolRoad(STAGE_ROWS, EFFECT_ROWS).resolveStage(stage, 2);
  assert.equal(resolved.effects.length, solo.effects.length);
  assert.notDeepEqual(resolved.effects, solo.effects);
  assert.equal(road.getMissingData(stage, 2), null);
});
