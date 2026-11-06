import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_PILES, S } from "gakumas-engine";
import { createEngine, parseActions } from "../helpers.mjs";

test("Good Impression card costs accumulate across a lesson", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.goodImpressionTurns] = 12;
  state[S.phase] = "processCost";

  engine.executor.executeActions(
    state,
    parseActions("goodImpressionTurns-=5"),
    null,
  );
  engine.executor.executeActions(
    state,
    parseActions("goodImpressionTurns-=4"),
    null,
  );

  assert.equal(state[S.goodImpressionTurns], 3);
  assert.equal(state[S.consumedGoodImpressionTurns], 9);
});

test("Good Impression decreases outside card costs do not accumulate", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.goodImpressionTurns] = 12;
  state[S.phase] = "processCard";

  engine.executor.executeActions(
    state,
    parseActions("goodImpressionTurns-=6"),
    null,
  );

  assert.equal(state[S.goodImpressionTurns], 6);
  assert.equal(state[S.consumedGoodImpressionTurns], 0);
});

test("buff costs are doubled while double buff cost is active", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.fullPowerCharge] = 10;
  state[S.doubleBuffCostTurns] = 1;
  state[S.phase] = "processCost";

  engine.executor.executeActions(
    state,
    parseActions("fullPowerCharge-=2"),
    null,
  );

  assert.equal(state[S.fullPowerCharge], 6);
});

test("double buff cost does not alter non-cost decreases", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.fullPowerCharge] = 10;
  state[S.doubleBuffCostTurns] = 1;
  state[S.phase] = "processCard";

  engine.executor.executeActions(
    state,
    parseActions("fullPowerCharge-=2"),
    null,
  );

  assert.equal(state[S.fullPowerCharge], 8);
});

test("good condition addition applies before the multiplicative buff", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);

  engine.executor.executeActions(
    state,
    parseActions(
      "setGoodConditionTurnsAdditionBuff(2,3); " +
        "setGoodConditionTurnsBuff(0.5,3); goodConditionTurns+=4",
    ),
    null,
  );

  assert.equal(state[S.goodConditionTurns], 9);
});

test("selected cards move from deck and discard to the top of deck", () => {
  const engine = createEngine({ skillCardIds: [19, 21, 23] });
  const state = engine.getInitialState(true);
  const [first, second, third] = state[S.deckCards];

  for (const pile of CARD_PILES) state[pile] = [];
  state[S.deckCards] = [first, second];
  state[S.discardedCards] = [third];
  engine.strategy = {
    pickCardsToMoveToTopOfDeck(_state, cards, num) {
      assert.deepEqual(cards, [first, second, third]);
      assert.equal(num, 2);
      return [0, 2];
    },
  };

  engine.executor.executeActions(
    state,
    parseActions("moveSelectedToTopOfDeck[deck | discarded](2)"),
    null,
  );

  assert.deepEqual(state[S.deckCards], [second, first, third]);
  assert.deepEqual(state[S.discardedCards], []);
  assert.equal(state[S.movedCard], third);
});
