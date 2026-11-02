import { test } from "node:test";
import assert from "node:assert/strict";
import { SkillCards, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  STRATEGIES,
  StageConfig,
  StageEngine,
  StagePlayer,
  resetRand,
} from "gakumas-engine";
import {
  createCustomStage,
  customStageErrors,
} from "../../../../gakumas-tools/utils/customStages.js";

function copy(stage, type = stage.type) {
  return createCustomStage(stage, {
    type,
    turnCounts: Object.values(stage.turnCounts),
    firstTurns: Object.values(stage.firstTurns),
    criteria: Object.values(stage.criteria),
    linkTurnCounts: stage.linkTurnCounts,
    effects: stage.effects,
  });
}

function idolFor(plan) {
  const card = SkillCards.getAll().find(
    (card) =>
      card.sourceType == "pIdol" && card.plan == (plan == "free" ? "sense" : plan),
  );
  return new IdolConfig({
    params: [1800, 2400, 2100, 50],
    supportBonus: 0.1,
    pItemIds: [],
    skillCardIdGroups: [[card.id, 1, 13]],
    customizationGroups: [[]],
  });
}

function config(stage, idol = idolFor(stage.plan)) {
  return new IdolStageConfig(idol, new StageConfig(stage));
}

test("a copy of a contest or event stage keeps its multipliers and starter deck", () => {
  for (const stage of Stages.getAll().filter((s) => s.type != "linkContest")) {
    const original = config(stage);
    const custom = config(copy(stage));
    assert.deepEqual(custom.typeMultipliers, original.typeMultipliers, stage.name);
    assert.deepEqual(custom.defaultCardIds, original.defaultCardIds, stage.name);
  }
});

test("a copy keeps the stage's plan for an idol without one", () => {
  const stage = Stages.getAll().find(
    (s) => s.type == "contest" && s.plan == "logic",
  );
  const idol = new IdolConfig({
    params: [100, 100, 100, 50],
    pItemIds: [],
    skillCardIdGroups: [[1]],
    customizationGroups: [[]],
  });
  assert.deepEqual(
    config(copy(stage), idol).defaultCardIds,
    config(stage, idol).defaultCardIds,
  );
});

test("a copy of a link stage keeps its phase changes", () => {
  for (const stage of Stages.getAll().filter((s) => s.type == "linkContest")) {
    assert.deepEqual(
      new StageConfig(copy(stage)).linkPhaseChangeTurns,
      new StageConfig(stage).linkPhaseChangeTurns,
      stage.name,
    );
  }
});

test("first-turn rates are kept to more than two decimals", () => {
  const stage = Stages.getById(66);
  assert.deepEqual(stage.firstTurns, { vocal: 0.125, dance: 0, visual: 0.875 });
  assert.deepEqual(copy(stage).firstTurns, stage.firstTurns);
});

test("changing the type drops the old type's season, plan and link phases", () => {
  const custom = copy(Stages.getById(121), "event");
  assert.equal(custom.season, undefined);
  assert.equal(custom.plan, "free");
  assert.deepEqual(custom.linkTurnCounts, []);
});

test("an unedited copy plays the same as its stage", async () => {
  async function play(stage) {
    const idolStageConfig = config(stage);
    const linkConfigs =
      stage.type == "linkContest"
        ? [idolStageConfig, idolStageConfig, idolStageConfig]
        : undefined;
    const engine = new StageEngine(idolStageConfig, linkConfigs);
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;
    resetRand(12345);
    return new StagePlayer(engine, strategy).play();
  }

  for (const id of [1, 109, 178, 121]) {
    const stage = Stages.getById(id);
    const original = await play(stage);
    const custom = await play(copy(stage));
    assert.equal(custom.score, original.score, stage.name);
    assert.deepEqual(custom.logs, original.logs, stage.name);
  }
});

test("every preset's turn settings are valid", () => {
  for (const stage of Stages.getAll()) {
    const errors = customStageErrors({
      type: stage.type,
      turnCounts: Object.values(stage.turnCounts),
      firstTurns: Object.values(stage.firstTurns),
      linkTurnCounts: stage.linkTurnCounts,
    });
    assert.deepEqual(errors, [], stage.name);
  }
});

test("a stage needs a turn, a first turn rate only on types with turns, and link phases adding up", () => {
  const settings = (overrides) => ({
    type: "linkContest",
    turnCounts: [4, 4, 0],
    firstTurns: [0.5, 0.5, 0],
    linkTurnCounts: [3, 3, 2],
    ...overrides,
  });
  assert.deepEqual(customStageErrors(settings()), []);
  assert.deepEqual(
    customStageErrors(settings({ type: "contest", linkTurnCounts: [] })),
    [],
  );
  assert.deepEqual(customStageErrors(settings({ turnCounts: [0, 0, 0] })), [
    "invalidTurnCounts",
    "invalidFirstTurns",
    "invalidLinkTurnCounts",
  ]);
  for (const firstTurns of [
    [0, 0, 0],
    [0.5, 0, 0.5],
  ]) {
    assert.deepEqual(customStageErrors(settings({ firstTurns })), [
      "invalidFirstTurns",
    ]);
  }
  for (const linkTurnCounts of [
    [4, 4, 4],
    [4, 4, 1],
    [8, null, 0],
  ]) {
    assert.deepEqual(customStageErrors(settings({ linkTurnCounts })), [
      "invalidLinkTurnCounts",
    ]);
  }
});

test("link phases entered for a stage turned into a link contest are kept", () => {
  const custom = createCustomStage(Stages.getById(1), {
    type: "linkContest",
    turnCounts: [5, 3, 4],
    firstTurns: [1, 0, 0],
    criteria: [1, 0, 0],
    linkTurnCounts: [2, 3, 7],
    effects: [],
  });
  assert.deepEqual(new StageConfig(custom).linkPhaseChangeTurns, [2, 5, 12]);
});
