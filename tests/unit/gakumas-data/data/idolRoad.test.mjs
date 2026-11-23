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
const PATTERN_ROWS = [
  { pattern: "A", idolIds: "1,2", stageIds: "900,902" },
  { pattern: "B", idolIds: 3, stageIds: "901,902" },
];

const idolRoad = createIdolRoad(STAGE_ROWS, EFFECT_ROWS, PATTERN_ROWS);

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
  // 佑芽 星南. 美鈴 and 燕 aren't known yet.
  const byIdol = (idolId) =>
    IdolRoad.getPattern(PIdols.getAll().find((p) => p.idolId == idolId).id);
  assert.deepEqual([1, 2, 6, 7, 9].map(byIdol), ["A", "A", "A", "A", "A"]);
  assert.deepEqual(
    [3, 4, 5, 8, 10, 11].map(byIdol),
    ["B", "B", "B", "B", "B", "B"],
  );
  assert.deepEqual([12, 13].map(byIdol), [null, null]);
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

test("咲季's stages written ahead of play are on pattern A and marked unplayed", () => {
  // STAGE 7, 8, 9, 13 and 14 come from the stage's 応援/トラブル text and
  // the road's turn counts, not from a play: they show as "STAGE n*".
  const ids = IdolRoad.getStageIds(1);
  const ahead = ids.map((id) => Stages.getById(id)).filter((s) => s.preview);
  assert.deepEqual(
    ahead.map((s) => s.stage),
    [7, 8, 9, 13, 14],
  );
  for (const s of ahead) {
    const resolved = IdolRoad.resolveStage(s, 41);
    assert.ok(resolved.effects.length > 0, `${s.name} has its 応援/トラブル`);
    const turns = Object.values(resolved.turnCounts).reduce((a, b) => a + b);
    assert.equal(turns, { 7: 8, 8: 14, 9: 16, 13: 18, 14: 18 }[s.stage]);
  }
});
