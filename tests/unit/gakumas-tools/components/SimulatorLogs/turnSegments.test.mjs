import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
import { turnSegments } from "../../../../../gakumas-tools/components/SimulatorLogs/turnSegments.js";
import { createEngine } from "../../../gakumas-engine/helpers.mjs";

const TYPES = ["vocal", "dance", "visual", "vocal"];

test("without extra turns the elapsed turns are the ones not remaining", () => {
  assert.deepEqual(turnSegments({ types: TYPES, elapsed: 1, remaining: 3 }), {
    turnsElapsed: 1,
    totalTurns: 4,
    remainingTurns: ["dance", "visual", "vocal"],
    currentTurnType: "dance",
  });
});

test("an extra turn adds a segment of the last type instead of going back a turn", () => {
  assert.deepEqual(turnSegments({ types: TYPES, elapsed: 2, remaining: 3 }), {
    turnsElapsed: 2,
    totalTurns: 5,
    remainingTurns: ["visual", "vocal", "vocal"],
    currentTurnType: "visual",
  });
});

test("the logged hand state points at the turn the engine is playing after an extra turn", () => {
  const engine = createEngine();
  engine.logger.enable();
  const state = engine.getInitialState(true);
  state[S.turnsRemaining] += 1;
  for (let turn = 0; turn < 3; turn++) {
    engine.turnManager.endTurn(state);
    const segments = turnSegments(
      engine.logger.getHandStateForLogging(state).turn,
    );
    assert.equal(segments.turnsElapsed, state[S.turnsElapsed]);
    assert.equal(
      segments.currentTurnType,
      engine.turnManager.getTurnType(state),
    );
  }
});
