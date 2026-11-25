import { test } from "node:test";
import assert from "node:assert/strict";
import { IdolRoad } from "gakumas-data";
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

const idolRoad = createIdolRoad(STAGE_ROWS, EFFECT_ROWS);

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

test("other stage types and unknown P-idols come back unchanged", () => {
  const contest = { ...stage, type: "contest" };
  assert.equal(idolRoad.resolveStage(contest, 2), contest);
  assert.equal(idolRoad.resolveStage(stage, 999999), stage);
  assert.equal(idolRoad.resolveStage(stage, undefined), stage);
});

test("the shipped Idol Road tables have no rows yet", () => {
  // Rows wait for in-game captures; until then resolution only sets the plan.
  const resolved = IdolRoad.resolveStage(stage, 2);
  assert.equal(resolved.plan, "sense");
  assert.equal(resolved.criteria, stage.criteria);
  assert.equal(resolved.effects, stage.effects);
});

test("stage texts come grouped by recommended effect, in turn order", () => {
  const texts = createIdolRoad([], [], [
    { stageId: 900, recommendedEffect: "concentration", turn: "5", kind: "trouble", text: "b" },
    { stageId: 900, recommendedEffect: "concentration", turn: "2", kind: "support", text: "a" },
    { stageId: 900, recommendedEffect: "goodConditionTurns", turn: "1", kind: "", text: "c" },
  ]);
  assert.deepEqual(texts.getStageTexts(900), [
    {
      recommendedEffect: "concentration",
      lines: [
        { turn: 2, kind: "support", text: "a" },
        { turn: 5, kind: "trouble", text: "b" },
      ],
    },
    {
      recommendedEffect: "goodConditionTurns",
      lines: [{ turn: 1, kind: null, text: "c" }],
    },
  ]);
  assert.deepEqual(texts.getStageTexts(901), []);
});

test("every stage text row is a known Idol Road stage, turn and kind", () => {
  for (const id of [196, 197, 198, 199, 200, 201, 202, 203, 204]) {
    const branches = IdolRoad.getStageTexts(id);
    assert.ok(branches.length > 0, `stage ${id} has texts`);
    for (const { recommendedEffect, lines } of branches) {
      assert.ok(
        ["goodImpressionTurns", "goodConditionTurns"].includes(recommendedEffect),
      );
      for (const line of lines) {
        assert.ok(Number.isInteger(line.turn) && line.turn >= 1);
        assert.ok([null, "support", "trouble"].includes(line.kind));
        assert.ok(line.text.length > 0);
      }
    }
  }
});
