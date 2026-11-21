import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
} from "gakumas-engine";
import { Stages } from "gakumas-data";
import { summarizeScores } from "./simulationRun";

// The stats a shared run shows on its stage's page come from simulating it
// here, never from the stats its owner's browser sent: those are only
// checked for shape, so they could say anything.

export const SERVER_RUNS = 1000;
export const SERVER_TIME_LIMIT_MS = 5000;
// Fewer runs than this and the mean isn't worth ranking on.
const MIN_RUNS = 200;

function stageConfigFor(doc) {
  if (!Number.isSafeInteger(doc?.stageId)) return null;
  const stage = Stages.getById(doc.stageId);
  return stage ? { stage, stageConfig: new StageConfig(stage) } : null;
}

function idolStageConfig(loadout, stageConfig, enterPercents) {
  return new IdolStageConfig(
    new IdolConfig(loadout),
    stageConfig,
    enterPercents,
  );
}

/**
 * Simulates a shared run's loadout on its game stage with the default
 * strategy: { stats, numRuns }, or null if it can't be simulated (no such
 * stage, a loadout the engine refuses, or too few runs in the time allowed).
 */
export async function simulateRunStats(
  doc,
  {
    numRuns = SERVER_RUNS,
    timeLimitMs = SERVER_TIME_LIMIT_MS,
    now = Date.now,
  } = {},
) {
  const found = stageConfigFor(doc);
  if (!found) return null;
  const { stage, stageConfig } = found;
  const enterPercents = !!doc.enterPercents;

  try {
    const config = idolStageConfig(doc, stageConfig, enterPercents);
    let linkConfigs = null;
    if (stage.type === "linkContest") {
      if (!Array.isArray(doc.linkLoadouts) || !doc.linkLoadouts.length) {
        return null;
      }
      linkConfigs = doc.linkLoadouts.map((ld) =>
        idolStageConfig(ld, stageConfig, enterPercents),
      );
    }
    const engine = new StageEngine(config, linkConfigs);
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;

    const deadline = now() + timeLimitMs;
    const scores = [];
    while (scores.length < numRuns && now() < deadline) {
      const result = await new StagePlayer(engine, strategy).play();
      if (!Number.isFinite(result?.score)) return null;
      scores.push(result.score);
    }
    if (scores.length < Math.min(MIN_RUNS, numRuns)) return null;
    return { stats: summarizeScores(scores), numRuns: scores.length };
  } catch {
    return null;
  }
}
