import { createSimulation } from ".";
import { WORKER_MESSAGE } from "./constants";

const simulations = new Map();
let queue = Promise.resolve();

async function handle({ type, runId, ...data }) {
  if (type === WORKER_MESSAGE.START) {
    const { idolStageConfig, linkConfigs, strategyName } = data;
    simulations.set(
      runId,
      createSimulation(idolStageConfig, linkConfigs, strategyName)
    );
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
