import {
  compareLoadoutCandidates,
  createLoadoutEvaluator,
} from "@/utils/loadoutOptimizer";

const RUNS = 50;
const VALIDATION_RUNS = 200;
const PROGRESS_EVERY = 32;

addEventListener("message", async ({ data }) => {
  const { baseline, candidates, enterPercents } = data;
  const evaluateLoadout = createLoadoutEvaluator(enterPercents);
  const total = (candidates.length + 1) * RUNS + 2 * VALIDATION_RUNS;
  let completed = 0;

  async function evaluate(loadout, seed) {
    const score = await evaluateLoadout(loadout, seed);
    completed++;
    if (completed % PROGRESS_EVERY == 0) {
      postMessage({ type: "progress", completed, total });
    }
    return score;
  }

  try {
    const result = await compareLoadoutCandidates({
      baseline,
      candidates,
      evaluate,
      runs: RUNS,
      validationRuns: VALIDATION_RUNS,
    });
    postMessage({ type: "result", result });
  } catch (error) {
    postMessage({ type: "error", message: error.message });
  }
});
