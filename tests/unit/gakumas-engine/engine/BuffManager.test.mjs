import { test } from "node:test";
import assert from "node:assert/strict";
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

test("a buff gained mid-turn keeps its protection when an older one has the same turns", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  const total = () =>
    state[S.scoreBuffs].reduce((sum, b) => sum + b.amount, 0);

  // Gained at the start of the turn (e.g. 141 とろけた時間): not fresh.
  state[S.unfreshPhase] = true;
  engine.buffManager.setScoreBuff(state, 0.5, 1);
  // Gained from a card this turn (e.g. 776 話題沸騰+): fresh.
  state[S.unfreshPhase] = false;
  engine.buffManager.setScoreBuff(state, 0.3, 1);
  assert.equal(total(), 0.8);

  // End of turn: the older buff expires, the card's lasts into next turn.
  engine.buffManager.decrementBuffTurns(state);
  assert.equal(total(), 0.3);
});
