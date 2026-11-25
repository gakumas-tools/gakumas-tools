import { test } from "node:test";
import assert from "node:assert/strict";
import { PDrinks } from "gakumas-data";
import { resetRand, S } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

const UNMEI_NO_DEAI_PLUS = 247;

test("next-turn reservations made at turn start fire on the next turn", () => {
  const engine = createEngine({
    params: [2000, 2700, 800, 50],
    pItemIds: [UNMEI_NO_DEAI_PLUS],
    skillCardIds: [527],
    stageId: 189,
  });
  let state = engine.startStage(engine.getInitialState());
  assert.equal(state[S.stance], "none");

  state[S.fullPowerCharge] = 10;
  state = engine.endTurn(state);
  assert.equal(state[S.stance], "fullPower");

  state = engine.endTurn(state);
  assert.equal(state[S.stance], "preservation");
});

// P-drinks: the engine's drink path must apply exactly what the fidelity
// harness's drinksBefore applies (tests/trainingFidelity.mjs), so produce-exam
// sims and captured replays agree on what a drink does.
const DRINKS = [5, 11, 18]; // ルイボスティー, フレッシュビネガー, 初星ホエイプロテイン

function stripLogs(state) {
  const copy = [...state];
  copy[S.logs] = null;
  copy[S.graphData] = null;
  return copy;
}

test("held P-drinks are drunk at the start of turn 1, as the harness drinks them", () => {
  const deck = [1, 3, 5, 13, 43, 45];
  resetRand(7);
  const drinker = createEngine({ skillCardIds: deck, pDrinkIds: DRINKS });
  const drunk = drinker.startStage(drinker.getInitialState());

  resetRand(7);
  const plain = createEngine({ skillCardIds: deck });
  const harness = plain.startStage(plain.getInitialState());
  for (const id of DRINKS) {
    plain.effectManager.triggerEffects(harness, PDrinks.getById(id).actions);
  }

  assert.deepEqual(stripLogs(drunk), stripLogs(harness));
  // And the drinks did something: 好印象 3, +3 固定元気, one more card use.
  assert.equal(drunk[S.goodImpressionTurns], 3);
  assert.equal(drunk[S.cardUsesRemaining], harness[S.cardUsesRemaining]);
  assert.ok(drunk[S.cardUsesRemaining] >= 2);
});

test("P-drinks: unknown ids are dropped and at most 3 are held", () => {
  const engine = createEngine({ pDrinkIds: [5, 0, 99999, 11, 18, 5] });
  assert.deepEqual(engine.config.idol.pDrinkIds, [5, 11, 18]);
});

test("a P-drink set for a later turn is drunk at that turn's start, as the harness drinks it", () => {
  const deck = [1, 3, 5, 13, 43, 45];
  resetRand(11);
  const drinker = createEngine({
    skillCardIds: deck,
    pDrinkIds: [5, 11],
    pDrinkTurns: [1, 3],
  });
  let drunk = drinker.startStage(drinker.getInitialState());
  assert.equal(drunk[S.goodImpressionTurns], 3);
  drunk = drinker.endTurn(drunk);
  drunk = drinker.endTurn(drunk);

  resetRand(11);
  const plain = createEngine({ skillCardIds: deck });
  let harness = plain.startStage(plain.getInitialState());
  plain.effectManager.triggerEffects(harness, PDrinks.getById(5).actions);
  harness = plain.endTurn(harness);
  // Turn 2 had nothing to drink.
  assert.equal(harness[S.turnsElapsed], 1);
  harness = plain.endTurn(harness);
  plain.effectManager.triggerEffects(harness, PDrinks.getById(11).actions);

  assert.equal(drunk[S.turnsElapsed], 2);
  assert.deepEqual(stripLogs(drunk), stripLogs(harness));
});

test("P-drink turns default to 1 and stay with their drink when slots are dropped", () => {
  const engine = createEngine({
    pDrinkIds: [5, 99999, 11, 18],
    pDrinkTurns: [4, 2, undefined, 0],
  });
  assert.deepEqual(engine.config.idol.pDrinkIds, [5, 11, 18]);
  assert.deepEqual(engine.config.idol.pDrinkTurns, [4, 1, 1]);
});
