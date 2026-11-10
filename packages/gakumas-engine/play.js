import { IdolConfig, IdolStageConfig, StageConfig } from "./config";
import { StageEngine, StagePlayer } from "./engine";
import STRATEGIES from "./strategies";
import { resetRand } from "./utils";

export function stageConfigFor(stage, loadout) {
  return new IdolStageConfig(
    new IdolConfig(loadout),
    new StageConfig(stage),
    loadout.enterPercents,
  );
}

// The engine's random stream is global, so plays must not interleave.
export async function playScores(
  config,
  linkConfigs,
  { seed, runs, signal, tick = () => {} },
) {
  const engine = new StageEngine(config, linkConfigs);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;

  const scores = [];
  for (let i = 0; i < runs; i++) {
    signal?.throwIfAborted();
    resetRand((seed + i) >>> 0);
    const { score } = await new StagePlayer(engine, strategy).play();
    scores.push(score);
    await tick();
  }
  return scores;
}
