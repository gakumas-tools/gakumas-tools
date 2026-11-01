import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  S,
  StageConfig,
  StageEngine,
} from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

const TODOITE_PLUS = 153;
const HEART_NO_AIZU_PLUS = 93;
const YUMEIRO_LIP_PLUS = 521;

function setup(skillCardIds) {
  const engine = createEngine({ skillCardIds });
  const state = engine.getInitialState(true);
  const cardOf = (id) => state[S.cardMap].findIndex((c) => c.id === id);
  return { cardManager: engine.cardManager, state, cardOf };
}

test("Cards that only reduce genki are not genki effect cards", () => {
  const { cardManager, state, cardOf } = setup([
    TODOITE_PLUS,
    HEART_NO_AIZU_PLUS,
    YUMEIRO_LIP_PLUS,
  ]);
  const effects = (id) => cardManager.getCardEffects(state, cardOf(id));

  assert.equal(effects(TODOITE_PLUS).has("genki"), false);
  assert.equal(effects(TODOITE_PLUS).has("score"), true);
  assert.equal(effects(HEART_NO_AIZU_PLUS).has("genki"), false);
  assert.equal(effects(YUMEIRO_LIP_PLUS).has("genki"), true);
});

test("Reductions in costs still count as costs", () => {
  const { cardManager, state, cardOf } = setup([TODOITE_PLUS]);

  assert.equal(
    cardManager.getCardCosts(state, cardOf(TODOITE_PLUS)).has("stamina"),
    true,
  );
});

test("changing idols in a link contest clears the held cards", () => {
  const stage = new StageConfig(
    Stages.getAll().find((s) => s.type == "linkContest"),
  );
  const idol = (cards) =>
    new IdolConfig({
      params: [1000, 1000, 1000, 50],
      supportBonus: 0,
      pItemIds: [],
      skillCardIdGroups: [cards],
      customizationGroups: [[]],
    });
  const linkConfigs = [
    new IdolStageConfig(idol([5, 7]), stage),
    new IdolStageConfig(idol([9, 11]), stage),
  ];
  const engine = new StageEngine(linkConfigs[0], linkConfigs);
  engine.logger.disable();
  let state = engine.getInitialState();
  engine.startStage(state);
  // Hold one of the first idol's cards, then end the turn before the change.
  for (const pile of [S.deckCards, S.handCards, S.discardedCards]) {
    state[pile] = state[pile].filter((c) => c !== 0);
  }
  state[S.heldCards] = [0];
  state[S.turnsElapsed] = stage.linkPhaseChangeTurns[0] - 1;
  state = engine.endTurn(state);
  assert.equal(state[S.linkPhase], 1);
  assert.deepEqual(state[S.heldCards], []);
});
