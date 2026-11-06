import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializeEffectSequence } from "gakumas-data";
import { S, StageConfig, resetRand } from "gakumas-engine";
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

test("a stage short of turns or types gets exactly its turn counts", () => {
  const engine = createEngine();
  const types = ["vocal", "dance", "visual"];
  for (let vocal = 0; vocal <= 4; vocal++) {
    for (let dance = 0; dance <= 4; dance++) {
      for (let visual = 0; visual <= 4; visual++) {
        const turnCounts = { vocal, dance, visual };
        const typesWithTurns = types.filter((type) => turnCounts[type]);
        if (!typesWithTurns.length) continue;
        const firstTurns = Object.fromEntries(
          types.map((type) => [
            type,
            turnCounts[type] ? 1 / typesWithTurns.length : 0,
          ]),
        );
        engine.config.stage = new StageConfig({
          turnCounts,
          firstTurns,
          criteria: { vocal: 0.5, dance: 0.3, visual: 0.2 },
          effects: [],
          linkTurnCounts: [],
        });

        for (let seed = 0; seed < 8; seed++) {
          resetRand(seed);
          const turns = engine.turnManager.generateTurnTypes();
          for (const type of types) {
            assert.equal(
              turns.filter((turn) => turn == type).length,
              turnCounts[type],
              JSON.stringify(turnCounts),
            );
          }
        }
      }
    }
  }
});
