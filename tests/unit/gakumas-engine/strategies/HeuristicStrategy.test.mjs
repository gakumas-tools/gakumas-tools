import { test } from "node:test";
import assert from "node:assert/strict";
import { S, STRATEGIES } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

function stateWithResources(engine, turnsRemaining) {
  const state = engine.getInitialState(true);
  state[S.turnsRemaining] = turnsRemaining;
  state[S.score] = 100;
  state[S.cardsUsed] = 10;
  state[S.genki] = 50;
  state[S.concentration] = 20;
  return state;
}

test("a finished stage is valued at its score alone", () => {
  const engine = createEngine();
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  const state = stateWithResources(engine, 0);
  assert.equal(strategy.getStateScore(state), 100);
});

test("a stage with turns left still values its resources", () => {
  const engine = createEngine();
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  const state = stateWithResources(engine, 1);
  assert.ok(strategy.getStateScore(state) > 100);
});

// 466 踏切の先に: if:isFullPower, score+=10 x3 (scores high in the
// full-power preview). 372 スパート: no conditions.
test("a selected use picks a card whose conditions pass", () => {
  const engine = createEngine({
    params: [1000, 1000, 1000, 50],
    skillCardIds: [466, 372],
  });
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const state = engine.getInitialState();
  const fumikiri = state[S.cardMap].findIndex((c) => c.id === 466);
  const spurt = state[S.cardMap].findIndex((c) => c.id === 372);
  const cards = [fumikiri, spurt];

  // Not in full power: only スパート can do anything.
  assert.deepEqual(strategy.pickCardsToUseFree(state, cards), [1]);

  // In full power both pass, and the ranking decides as before.
  engine.buffManager.setStance(state, "fullPower");
  assert.deepEqual(
    strategy.pickCardsToUseFree(state, cards),
    strategy.pickCardsToHold(state, cards),
  );
});
