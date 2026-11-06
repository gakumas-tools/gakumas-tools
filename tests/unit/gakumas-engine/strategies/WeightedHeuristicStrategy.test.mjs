import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  S,
  STRATEGIES,
  resetRand,
} from "gakumas-engine";
import WeightedHeuristicStrategy from "../../../../packages/gakumas-engine/strategies/WeightedHeuristicStrategy.js";
import { createEngine } from "../helpers.mjs";
import { loadSuite, loadoutFromQuery } from "../../../lib.mjs";

async function play(config, Strategy) {
  resetRand(12345);
  const engine = new StageEngine(config);
  const strategy = new Strategy(engine);
  engine.strategy = strategy;
  return new StagePlayer(engine, strategy).play();
}

test("default weights play every suite deck as HeuristicStrategy does", async () => {
  for (const row of loadSuite()) {
    const loadout = loadoutFromQuery(row.query);
    const stage = Stages.getById(loadout.stageId);
    const config = new IdolStageConfig(
      new IdolConfig(loadout),
      new StageConfig(stage)
    );
    const expected = await play(config, STRATEGIES.HeuristicStrategy);
    const actual = await play(config, WeightedHeuristicStrategy);
    assert.deepEqual(actual, expected, row.id);
  }
});

test("a finished stage is valued at its score whatever the weights", () => {
  const engine = createEngine();
  const strategy = new WeightedHeuristicStrategy(engine, {
    buff: 4,
    score: 4,
    stamina: 4,
    hand: 4,
    cardsUsed: 4,
  });
  const state = engine.getInitialState(true);
  state[S.turnsRemaining] = 0;
  state[S.score] = 123;
  state[S.cardsUsed] = 10;
  assert.equal(strategy.getStateScore(state), 123);
});
