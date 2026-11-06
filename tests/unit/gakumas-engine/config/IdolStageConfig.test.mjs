import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
} from "gakumas-engine";

function idolStageConfig(stageId, skillCardIds) {
  const idol = new IdolConfig({
    params: [1000, 1000, 1000, 40],
    supportBonus: 0,
    pItemIds: [],
    skillCardIdGroups: [skillCardIds],
    customizationGroups: [[]],
  });
  const stage = new StageConfig(Stages.getById(stageId));
  return new IdolStageConfig(idol, stage);
}

test("an early event stage with a preservation p-idol uses its plan's deck", () => {
  // 544 is the signature card of p-idol 93 (anomaly, recommended effect
  // preservation); 111 is a season 2 event stage.
  const config = idolStageConfig(111, [544]);
  assert.equal(config.idol.recommendedEffect, "preservation");
  assert.deepEqual(config.defaultCardIds, [370, 372, 1, 1, 374, 374, 376, 376]);

  const engine = new StageEngine(config);
  engine.logger.disable();
  assert.doesNotThrow(() => engine.getInitialState());
});

test("other recommended effects keep their event decks", () => {
  // 182 is the signature card of p-idol 1 (sense, goodConditionTurns).
  const config = idolStageConfig(111, [182]);
  assert.equal(config.idol.recommendedEffect, "goodConditionTurns");
  assert.deepEqual(config.defaultCardIds, [15, 15, 5, 1, 1, 3, 13, 13]);
});
