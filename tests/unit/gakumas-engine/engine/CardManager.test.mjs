import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
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
