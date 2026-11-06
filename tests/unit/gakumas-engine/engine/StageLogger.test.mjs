import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

test("the logged hand state includes every buff list", () => {
  const engine = createEngine();
  const state = engine.startStage(engine.getInitialState());
  engine.buffManager.setConcentrationEffectBuff(state, 0.15, 3);
  engine.buffManager.setGoodImpressionTurnsTimesBuff(state, 1, 2);

  const handState = engine.logger.getHandStateForLogging(state);
  assert.deepEqual(
    handState[S.concentrationEffectBuffs].map(({ amount, turns }) => [
      amount,
      turns,
    ]),
    [[0.15, 3]],
  );
  assert.deepEqual(
    handState[S.goodImpressionTurnsTimesBuffs].map(({ amount, turns }) => [
      amount,
      turns,
    ]),
    [[1, 2]],
  );
});
