import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializeEffectSequence } from "gakumas-data";
import { S } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

test("enthusiasm is cleared at the end of the turn", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.enthusiasm] = 10;

  engine.turnManager.endTurn(state);

  assert.equal(state[S.enthusiasm], 0);
});

test("enthusiasm extension keeps enthusiasm through the next turn", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.enthusiasm] = 10;
  state[S.enthusiasmExtensionTurns] = 1;

  engine.turnManager.endTurn(state);
  assert.equal(state[S.enthusiasm], 10);
  assert.equal(state[S.enthusiasmExtensionTurns], 0);

  engine.turnManager.endTurn(state);
  assert.equal(state[S.enthusiasm], 0);
});

test("an end-of-turn extension applies to the turn it is registered in", () => {
  const engine = createEngine();
  const state = engine.getInitialState(true);
  state[S.enthusiasm] = 10;

  engine.effectManager.triggerEffects(
    state,
    deserializeEffectSequence(
      "at:endOfTurn { enthusiasmExtensionTurns+=1; limit:1 }",
    ),
  );
  engine.turnManager.endTurn(state);

  assert.equal(state[S.enthusiasm], 10);
});
