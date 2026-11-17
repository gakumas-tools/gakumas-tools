import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializeEffectSequence, SkillCards } from "gakumas-data";
import { S } from "gakumas-engine";
import { createEngine, parseActions } from "../helpers.mjs";

test("good condition addition buff uses the normal buff duration lifecycle", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);

  engine.executor.executeActions(
    state,
    parseActions("setGoodConditionTurnsAdditionBuff(2,3)"),
    null,
  );

  engine.buffManager.decrementBuffTurns(state);
  assert.equal(state[S.goodConditionTurnsAdditionBuffs][0].turns, 3);
  engine.buffManager.decrementBuffTurns(state);
  assert.equal(state[S.goodConditionTurnsAdditionBuffs][0].turns, 2);
});

// UNVERIFIED: the rule (a card is blocked while the debuff is up if it has
// that effect anywhere in its actions) is not yet checked against a capture.
const CASES = [
  ["noGoodConditionTurnsTurns", "goodConditionTurns"],
  ["noConcentrationTurns", "concentration"],
  ["noGoodImpressionTurnsTurns", "goodImpressionTurns"],
  ["noMotivationTurns", "motivation"],
  ["noStrengthTurns", "strength"],
  ["noFullPowerChargeTurns", "fullPowerCharge"],
];

const params = [1000, 1000, 1000, 50];

function usableCardWithAndWithout(effect) {
  let withId, withoutId;
  for (const card of SkillCards.getAll()) {
    if (withId != null && withoutId != null) break;
    if (card.conditions?.length) continue;
    const engine = createEngine({ params, skillCardIds: [card.id] });
    const state = engine.getInitialState();
    const idx = state[S.cardMap].findIndex((c) => c.id === card.id);
    if (idx < 0 || !engine.cardManager.isCardUsable(state, idx)) continue;
    const has = engine.cardManager.getCardEffects(state, idx).has(effect);
    if (has && withId == null) withId = card.id;
    if (!has && withoutId == null) withoutId = card.id;
  }
  return [withId, withoutId];
}

for (const [field, effect] of CASES) {
  test(`${field} blocks only cards with ${effect}`, () => {
    const [withId, withoutId] = usableCardWithAndWithout(effect);
    assert.ok(withId != null && withoutId != null);
    const engine = createEngine({ params, skillCardIds: [withId, withoutId] });
    const state = engine.getInitialState();
    const of = (id) => state[S.cardMap].findIndex((c) => c.id === id);
    assert.equal(state[S[field]], 0);
    assert.equal(engine.cardManager.isCardUsable(state, of(withId)), true);
    state[S[field]] = 1;
    assert.equal(engine.cardManager.isCardUsable(state, of(withId)), false);
    assert.equal(engine.cardManager.isCardUsable(state, of(withoutId)), true);
  });
}

test("the no-effect-card debuffs wear off at end of turn", () => {
  const engine = createEngine({ params });
  const state = engine.getInitialState();
  for (const [field] of CASES) state[S[field]] = 2;
  engine.buffManager.decrementBuffTurns(state);
  for (const [field] of CASES) assert.equal(state[S[field]], 1, field);
});

// UNVERIFIED: 手札減少 as "draw this many fewer at turn start" is not yet
// checked against a capture.
test("setHandDecrease draws fewer cards at the start of the turn", () => {
  const engine = createEngine({ skillCardIds: [19, 19, 19, 19, 19, 19, 19, 19] });
  const state = engine.getInitialState(true);
  engine.executor.executeActions(state, parseActions("setHandDecrease(1,2)"));
  assert.equal(engine.buffManager.getHandDecrease(state), 1);
  engine.turnManager.startTurn(state);
  assert.equal(state[S.handCards].length, 2);
});

test("nullifyDebuff blocks setHandDecrease", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.nullifyDebuff] = 1;
  engine.executor.executeActions(state, parseActions("setHandDecrease(1,2)"));
  assert.deepEqual(state[S.handDecreases], []);
  assert.equal(state[S.nullifyDebuff], 0);
});

// UNVERIFIED: what counts toward 低下状態の数 is our reading.
test("countDebuffs counts debuff counters and debuff list entries", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  assert.equal(engine.buffManager.countDebuffs(state), 0);
  state[S.poorConditionTurns] = 2;
  state[S.noConcentrationTurns] = 1;
  engine.executor.executeActions(
    state,
    parseActions("setScoreDebuff(0.1,2);setHandDecrease(1,1)"),
  );
  assert.equal(engine.buffManager.countDebuffs(state), 4);
  assert.equal(
    engine.evaluator.evaluateCondition(
      state,
      deserializeEffectSequence("if:countDebuffs>=4 { score+=1 }")[0]
        .conditions[0],
    ),
    true,
  );
});

// 7 ばくおんライオン is a P-idol p-item with limit:1; 3 はつぼし手帳 is a
// produce p-item with limit:1.
// UNVERIFIED: which p-items incrementPIdolPItemLimit reaches is not yet
// checked against a capture.
test("incrementPIdolPItemLimit re-arms a used-up P-idol p-item only", () => {
  const engine = createEngine({ pItemIds: [7, 3] });
  const state = engine.getInitialState();
  const find = (id) =>
    state[S.effects].findIndex(
      (e) => e.source?.type === "pItem" && e.source.id === id,
    );
  for (const id of [7, 3]) {
    state[S.effects][find(id)] = { ...state[S.effects][find(id)], limit: 0 };
  }
  engine.effectManager.clearExpiredEffects(state);
  assert.equal(find(3), -1);
  assert.equal(state[S.effects][find(7)].limit, 0);

  engine.executor.executeActions(
    state,
    parseActions("incrementPIdolPItemLimit(1)"),
  );
  assert.equal(state[S.effects][find(7)].limit, 1);
});
