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
