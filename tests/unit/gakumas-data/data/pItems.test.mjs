// N.I.A P-items 274–279, written from their P図鑑 text; not yet seen in play.
import { test } from "node:test";
import assert from "node:assert/strict";
import { G, S } from "gakumas-engine";
import { createEngine } from "../../gakumas-engine/helpers.mjs";

const SPURT = 372; // スパート: 全力値+1
const GREETING = 368; // 挨拶の基本: 強気

function start(pItemIds, skillCardIds) {
  const engine = createEngine({ pItemIds, skillCardIds });
  return { engine, state: engine.startStage(engine.getInitialState()) };
}

const many = (n, id = 19) => Array(n).fill(id);
// Lasting score buffs add up in one entry. The idol's 8 default cards are in
// the deck too, so many(1) makes a 9-card deck and many(20) a 28-card one.
const buff = (state) =>
  Math.round(
    state[S.scoreBuffs]
      .filter((b) => b.turns == null)
      .reduce((acc, b) => acc + b.amount, 0) * 100,
  );

for (const [id, field] of [
  [274, S.goodConditionTurns],
  [275, S.concentration],
  [276, S.goodImpressionTurns],
  [277, S.motivation],
]) {
  test(`${id}: 12+ cards in deck or discard draws a card, +5% and +1, 5 times`, () => {
    const base = start([], many(20)).state;
    let { engine, state } = start([id], many(20));
    assert.equal(state[S.handCards].length, base[S.handCards].length + 1);
    assert.equal(buff(state), 5);
    assert.equal(state[field], 1);
    for (let t = 0; t < 7; t++) state = engine.endTurn(state);
    assert.equal(buff(state), 25);
  });

  test(`${id}: fewer than 12 cards in deck or discard does nothing`, () => {
    const { state } = start([id], many(1));
    assert.equal(buff(state), 0);
    assert.equal(state[field], 0);
  });
}

for (const [id, grown, other] of [
  [278, SPURT, GREETING],
  [279, GREETING, SPURT],
]) {
  test(`${id}: 18+ cards gives +25% and +10 to the matching cards, once`, () => {
    let { engine, state } = start([id], [...many(20), SPURT, GREETING]);
    assert.equal(buff(state), 25);
    const growth = (cardId) =>
      state[S.cardMap].find((c) => c.id === cardId).growth?.[G["g.score"]] ??
      0;
    assert.equal(growth(grown), 10);
    assert.equal(growth(other), 0);
    for (let t = 0; t < 3; t++) state = engine.endTurn(state);
    assert.equal(buff(state), 25);
  });

  test(`${id}: fewer than 18 cards does nothing`, () => {
    const { state } = start([id], [...many(1), SPURT, GREETING]);
    assert.equal(buff(state), 0);
  });
}
