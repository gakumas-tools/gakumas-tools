import {
  CHUNKS_PER_WORKER,
  MAX_CHUNK_SIZE,
  MAX_WORKERS,
  WORKER_MESSAGE,
} from "./constants";

let workers = null;
let holders = 0;
let cancelPrewarm = null;
let nextRunId = 0;
const pendingRejects = new Set();

export function workerCount() {
  return Math.min(navigator.hardwareConcurrency || 1, MAX_WORKERS);
}

// Call from a mount effect and run the returned release on unmount.
export function retainWorkerPool() {
  holders++;
  schedulePrewarm();
  return () => {
    holders--;
    if (holders > 0) return;
    cancelPrewarm?.();
    terminatePool(new DOMException("Worker pool released", "AbortError"));
  };
}

function schedulePrewarm() {
  if (!holders || workers || cancelPrewarm) return;
  const prewarm = () => {
    cancelPrewarm = null;
    getWorkerPool();
  };
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(prewarm, { timeout: 2000 });
    cancelPrewarm = () => {
      cancelIdleCallback(handle);
      cancelPrewarm = null;
    };
  } else {
    const handle = setTimeout(prewarm);
    cancelPrewarm = () => {
      clearTimeout(handle);
      cancelPrewarm = null;
    };
  }
}

function terminatePool(reason) {
  workers?.forEach((worker) => worker.terminate());
  workers = null;
  pendingRejects.forEach((reject) => reject(reason));
  pendingRejects.clear();
}

function getWorkerPool() {
  if (!workers) {
    workers = Array.from(
      { length: workerCount() },
      () => new Worker(new URL("./worker.js", import.meta.url))
    );
  }
  return workers;
}

export function runOnWorkers(
  { idolStageConfig, linkConfigs, strategyName, numRuns },
  onProgress,
  signal
) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const allWorkers = getWorkerPool();
  const chunkSize = Math.max(
    1,
    Math.min(
      MAX_CHUNK_SIZE,
      Math.ceil(numRuns / (allWorkers.length * CHUNKS_PER_WORKER))
    )
  );
  const pool = allWorkers.slice(0, Math.ceil(numRuns / chunkSize));
  // Two Simulators can share the pool, so each run tags its own messages.
  const runId = nextRunId++;
  let unassigned = numRuns;

  function sendChunk(worker) {
    if (unassigned > 0) {
      const chunk = Math.min(chunkSize, unassigned);
      unassigned -= chunk;
      worker.postMessage({ type: WORKER_MESSAGE.CHUNK, runId, numRuns: chunk });
    } else {
      worker.postMessage({ type: WORKER_MESSAGE.FINISH, runId });
    }
  }

  const listeners = new AbortController();
  signal?.addEventListener(
    "abort",
    () => {
      terminatePool(signal.reason);
      schedulePrewarm();
    },
    { once: true, signal: listeners.signal }
  );

  let rejectRun;
  return new Promise((resolve, reject) => {
    rejectRun = reject;
    pendingRejects.add(reject);
    const results = [];
    const fail = (err) => {
      pool.forEach((worker) =>
        worker.postMessage({ type: WORKER_MESSAGE.CANCEL, runId })
      );
      reject(err);
    };

    for (const worker of pool) {
      worker.addEventListener(
        "message",
        ({ data }) => {
          if (data.runId !== runId) return;
          if (data.type === WORKER_MESSAGE.CHUNK_DONE) {
            onProgress(data.numRuns);
            sendChunk(worker);
          } else if (data.type === WORKER_MESSAGE.RESULT) {
            results.push(data.result);
            if (results.length === pool.length) resolve(results);
          } else if (data.type === WORKER_MESSAGE.ERROR) {
            fail(new Error(data.message));
          }
        },
        { signal: listeners.signal }
      );
      worker.addEventListener(
        "error",
        (e) => fail(e.error || new Error(e.message || "Worker failed")),
        { signal: listeners.signal }
      );
      worker.postMessage({
        type: WORKER_MESSAGE.START,
        runId,
        idolStageConfig,
        linkConfigs,
        strategyName,
      });
      sendChunk(worker);
    }
  }).finally(() => {
    listeners.abort();
    pendingRejects.delete(rejectRun);
  });
}
