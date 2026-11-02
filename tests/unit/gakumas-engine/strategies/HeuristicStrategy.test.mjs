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
