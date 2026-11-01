import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializeEffectSequence, SkillCards } from "gakumas-data";
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

test("a free use inside a card's actions keeps that card's phase and usedCard", () => {
  // 830 舞台で輝く一番星: concentration+=4; useRandomFree[hand & SR];
  // cardUsesRemaining+=1; drawCard
  const sr = SkillCards.getAll().find(
    (c) =>
      c.rarity === "SR" &&
      !c.upgraded &&
      c.type === "active" &&
      c.plan === "sense" &&
      c.sourceType === "produce" &&
      !c.conditions?.length,
  );
  const engine = createEngine({
    params: [1000, 1000, 1000, 50],
    skillCardIds: [830, sr.id],
  });
  const state = engine.getInitialState();
  const outer = state[S.cardMap].findIndex((c) => c.id === 830);
  const inner = state[S.cardMap].findIndex((c) => c.id === sr.id);
  engine.effectManager.setEffects(
    state,
    deserializeEffectSequence(
      "at:afterCardUsed { if:usedCardId==830 { do:fixedGenki+=100 } }; " +
        "at:cardMovedToHand { if:isDirectEffect { do:fixedGenki+=1 } }",
    ),
  );
  state[S.handCards] = [outer, inner];
  state[S.deckCards] = state[S.deckCards].filter(
    (c) => c !== outer && c !== inner,
  );
  state[S.cardUsesRemaining] = 5;
  const after = engine.useCard(state, outer);
  // 830's own afterCardUsed fired (+100), and its drawCard after the free
  // use counted as a direct effect (+1).
  assert.equal(after[S.genki], 101);
  assert.equal(after[S.lastUsedCard], outer);
  assert.equal(after[S.usedCard], null);
});
