import { StageEngine, StagePlayer, STRATEGIES } from "gakumas-engine";
import {
  accumulateCardUsage,
  accumulateScoreStats,
  formatRun,
  mergeGraphDatas,
} from "@/utils/simulator";

export function createSimulation(idolStageConfig, linkConfigs, strategyName) {
  const engine = new StageEngine(idolStageConfig, linkConfigs);
  const strategy = new STRATEGIES[strategyName](engine);
  engine.strategy = strategy;

  let totalScore = 0;
  let averageScore = 0;
  let minRun, averageRun, maxRun;
  let scores = [];
  let graphDatas = [];
  const cardUsage = { numRuns: 0, turns: [] };
  const scoreStats = { numRuns: 0, turns: [] };

  async function run(numRuns, onProgress) {
    const progressStep = Math.max(1, Math.floor(numRuns / 20));

    for (let i = 0; i < numRuns; i++) {
      const result = await new StagePlayer(engine, strategy).play();

      // Track min/average/max runs
      if (!minRun || result.score < minRun.score) {
        minRun = result;
      }
      if (!maxRun || result.score > maxRun.score) {
        maxRun = result;
      }
      totalScore += result.score;
      averageScore = Math.round(totalScore / (scores.length + 1));
      if (
        !averageRun ||
        Math.abs(result.score - averageScore) <
          Math.abs(averageRun.score - averageScore)
      ) {
        averageRun = result;
      }

      scores.push(result.score);
      graphDatas.push(result.graphData);

      // Accumulate per-turn stats from this run's log stream. Logs for
      // non-representative runs are dropped after this line, so we must
      // extract stats now.
      accumulateCardUsage(result.logs, cardUsage);
      accumulateScoreStats(result.logs, scoreStats);

      if (onProgress && ((i + 1) % progressStep === 0 || i === numRuns - 1)) {
        onProgress(i + 1);
      }
    }
  }

  function result() {
    return {
      ...mergeGraphDatas(graphDatas),
      minRun: formatRun(minRun),
      averageRun: formatRun(averageRun),
      maxRun: formatRun(maxRun),
      averageScore,
      scores,
      cardUsage,
      scoreStats,
    };
  }

  return { run, result };
}

export async function simulate(
  idolStageConfig,
  linkConfigs,
  strategyName,
  numRuns,
  onProgress
) {
  const simulation = createSimulation(idolStageConfig, linkConfigs, strategyName);
  await simulation.run(numRuns, onProgress);
  return simulation.result();
}
