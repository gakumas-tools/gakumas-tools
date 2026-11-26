import { createSimulation, scorePDrinkOptions } from ".";
import { WORKER_MESSAGE } from "./constants";

const simulations = new Map();
let queue = Promise.resolve();

async function handle({ type, runId, ...data }) {
  if (type === WORKER_MESSAGE.START) {
    const { idolStageConfig, linkConfigs, strategyName, pDrinkTurns } = data;
    simulations.set(
      runId,
      createSimulation(idolStageConfig, linkConfigs, strategyName, pDrinkTurns)
    );
  } else if (type === WORKER_MESSAGE.SCORE_P_DRINKS) {
    const { idolStageConfig, linkConfigs, strategyName, ...share } = data;
    const scores = await scorePDrinkOptions(
      idolStageConfig,
      linkConfigs,
      strategyName,
      share
    );
    postMessage({ type: WORKER_MESSAGE.P_DRINK_SCORES, runId, scores });
  } else if (type === WORKER_MESSAGE.CANCEL) {
    simulations.delete(runId);
  } else if (!simulations.has(runId)) {
    return;
  } else if (type === WORKER_MESSAGE.CHUNK) {
    await simulations.get(runId).run(data.numRuns);
    postMessage({ type: WORKER_MESSAGE.CHUNK_DONE, runId, numRuns: data.numRuns });
  } else if (type === WORKER_MESSAGE.FINISH) {
    const result = simulations.get(runId).result();
    simulations.delete(runId);
    postMessage({ type: WORKER_MESSAGE.RESULT, runId, result });
  }
}

addEventListener("message", ({ data }) => {
  queue = queue.then(() =>
    handle(data).catch((err) => {
      console.error(err);
      simulations.delete(data.runId);
      postMessage({
        type: WORKER_MESSAGE.ERROR,
        runId: data.runId,
        message: err?.message || String(err),
      });
    })
  );
});
