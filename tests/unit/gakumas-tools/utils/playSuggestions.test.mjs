import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  STRATEGIES,
  S,
  resetRand,
} from "gakumas-engine";
import { suggestPlays } from "../../../../gakumas-tools/utils/playSuggestions.js";

const stage = Stages.getAll().find((s) => s.type == "contest" && !s.preview);

function setup() {
  resetRand(7);
  const idol = new IdolConfig({
    params: [1500, 1500, 1500, 40],
    supportBonus: 0.04,
    pItemIds: [],
    skillCardIdGroups: [[1, 3, 5, 7, 9, 1, 3, 5]],
    customizationGroups: [[]],
  });
  const config = new IdolStageConfig(idol, new StageConfig(stage));
  const engine = new StageEngine(config);
  engine.strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.logger.disable();
  const state = engine.startStage(engine.getInitialState());
  return { config, engine, state };
}

test("one play per usable hand card, then ending the turn", () => {
  const { config, engine, state } = setup();
  const usable = state[S.handCards].filter((c) => engine.isCardUsable(state, c));
  const { plays, best } = suggestPlays(config, undefined, state, { playouts: 4 });
  assert.deepEqual(
    plays.map((p) => p.card),
    [...usable, null],
  );
  for (const p of plays) {
    assert.ok(Number.isFinite(p.mean) && p.min <= p.mean && p.mean <= p.max);
  }
  assert.equal(best.mean, Math.max(...plays.map((p) => p.mean)));
});

test("the same seed gives the same expectations, and the state is left as it was", () => {
  const { config, state } = setup();
  const before = JSON.stringify(state);
  const a = suggestPlays(config, undefined, state, { playouts: 4, seed: 3 });
  const b = suggestPlays(config, undefined, state, { playouts: 4, seed: 3 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(state), before);
});

test("on the last turn, playing a scoring card beats ending the turn", () => {
  const { config, engine } = setup();
  let { state } = setup();
  while (state[S.turnsRemaining] > 1) state = engine.endTurn(state);
  const { plays, best } = suggestPlays(config, undefined, state, { playouts: 2 });
  const end = plays.find((p) => p.card == null);
  assert.notEqual(best.card, null);
  assert.ok(best.mean > end.mean);
});
