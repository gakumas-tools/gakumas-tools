import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
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
