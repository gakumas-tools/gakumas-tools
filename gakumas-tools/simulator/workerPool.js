import { planPDrinkTurns, StageEngine } from "gakumas-engine";
import {
  CHUNKS_PER_WORKER,
  MAX_CHUNK_SIZE,
  MAX_WORKERS,
  P_DRINK_PLAN_RUNS,
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
    workers = Array.from({ length: workerCount() }, () => {
      const worker = new Worker(new URL("./worker.js", import.meta.url));
      worker.addEventListener("error", (e) => {
        if (workers?.includes(worker)) {
          terminatePool(e.error || new Error(e.message || "Worker failed"));
        }
      });
      return worker;
    });
  }
  return workers;
}

// Plans the turn of each P-drink left on auto (planPDrinkTurns), with each
// drink's options split across the workers so planning takes about as long
// as one option. Returns the planned turns, one per drink the engine holds
// (its idol.pDrinkIds), or null when no drink is on auto.
export async function planPDrinksOnWorkers(
  { idolStageConfig, linkConfigs, strategyName },
  signal
) {
  const { idol } = idolStageConfig;
  if (!idol.pDrinkIds?.some((_, slot) => !idol.pDrinkTurns?.[slot])) {
    return null;
  }
  const engine = new StageEngine(idolStageConfig, linkConfigs);
  return planPDrinkTurns(engine, null, {
    scoreOptions: (options, seed) =>
      scoreOnWorkers(
        { idolStageConfig, linkConfigs, strategyName, options, seed },
        signal
      ),
  });
}

function scoreOnWorkers(
  { idolStageConfig, linkConfigs, strategyName, options, seed },
  signal
) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const allWorkers = getWorkerPool();
  const shareSize = Math.ceil(options.length / allWorkers.length);
  const shares = [];
  for (let i = 0; i < options.length; i += shareSize) {
    shares.push(options.slice(i, i + shareSize));
  }
  const pool = allWorkers.slice(0, shares.length);
  const runId = nextRunId++;

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
    const scores = new Array(shares.length);
    let done = 0;
    pool.forEach((worker, i) => {
      worker.addEventListener(
        "message",
        ({ data }) => {
          if (data.runId !== runId) return;
          if (data.type === WORKER_MESSAGE.P_DRINK_SCORES) {
            scores[i] = data.scores;
            if (++done === pool.length) resolve(scores.flat());
          } else if (data.type === WORKER_MESSAGE.ERROR) {
            reject(new Error(data.message));
          }
        },
        { signal: listeners.signal }
      );
      worker.addEventListener(
        "error",
        (e) => reject(e.error || new Error(e.message || "Worker failed")),
        { signal: listeners.signal }
      );
      worker.postMessage({
        type: WORKER_MESSAGE.SCORE_P_DRINKS,
        runId,
        idolStageConfig,
        linkConfigs,
        strategyName,
        options: shares[i],
        seed,
        runsPerOption: P_DRINK_PLAN_RUNS,
      });
    });
  }).finally(() => {
    listeners.abort();
    pendingRejects.delete(rejectRun);
  });
}

export function runOnWorkers(
  { idolStageConfig, linkConfigs, strategyName, numRuns, pDrinkTurns },
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
        pDrinkTurns,
      });
      sendChunk(worker);
    }
  }).finally(() => {
    listeners.abort();
    pendingRejects.delete(rejectRun);
  });
}

// The simulator's expectation of each play open at a manual-play card
// choice (suggestPlays), worked out on one of the pool's workers so the page
// stays responsive. An abort rejects the promise but leaves the pool running:
// the worker finishes the request and its answer is dropped.
export function suggestPlaysOnWorker(
  { idolStageConfig, linkConfigs, state },
  signal
) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const worker = getWorkerPool()[0];
  const runId = nextRunId++;
  const listeners = new AbortController();

  let rejectRun;
  return new Promise((resolve, reject) => {
    rejectRun = reject;
    pendingRejects.add(reject);
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
      signal: listeners.signal,
    });
    worker.addEventListener(
      "message",
      ({ data }) => {
        if (data.runId !== runId) return;
        if (data.type === WORKER_MESSAGE.PLAY_SUGGESTIONS) {
          resolve(data.suggestions);
        } else if (data.type === WORKER_MESSAGE.ERROR) {
          reject(new Error(data.message));
        }
      },
      { signal: listeners.signal }
    );
    worker.postMessage({
      type: WORKER_MESSAGE.SUGGEST_PLAYS,
      runId,
      idolStageConfig,
      linkConfigs,
      state,
    });
  }).finally(() => {
    listeners.abort();
    pendingRejects.delete(rejectRun);
  });
}
