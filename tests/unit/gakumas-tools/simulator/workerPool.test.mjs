import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

Object.defineProperty(globalThis, "navigator", {
  value: { hardwareConcurrency: 4 },
  configurable: true,
});

let workers = [];
let msPerRun = () => 0;
let failToLoad = false;

class FakeWorker extends EventTarget {
  constructor() {
    super();
    this.index = workers.length;
    this.runs = 0;
    this.terminated = false;
    this.queue = Promise.resolve();
    workers.push(this);
    if (failToLoad) {
      setTimeout(() => {
        this.terminated = true;
        this.dispatchEvent(
          Object.assign(new Event("error"), { message: "failed to load" })
        );
      });
    }
  }

  postMessage(message) {
    this.queue = this.queue.then(() => this.handle(message));
  }

  async handle({ type, runId, numRuns }) {
    if (this.terminated) return;
    if (type === "chunk") {
      await sleep(numRuns * msPerRun(this.index));
      this.runs += numRuns;
      this.reply({ type: "chunkDone", runId, numRuns });
    } else if (type === "finish") {
      this.reply({ type: "result", runId, result: { runs: this.runs } });
    }
  }

  reply(data) {
    if (!this.terminated) {
      this.dispatchEvent(new MessageEvent("message", { data }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}
globalThis.Worker = FakeWorker;

const { retainWorkerPool, runOnWorkers } = await import(
  "../../../../gakumas-tools/simulator/workerPool.js"
);

const config = {
  idolStageConfig: {},
  linkConfigs: null,
  strategyName: "HeuristicStrategy",
};

beforeEach(() => {
  workers = [];
  msPerRun = () => 0;
  failToLoad = false;
});

test("retaining the pool spawns workers before the first run", async () => {
  const release = retainWorkerPool();
  await sleep(0);
  assert.equal(workers.length, 4);
  await runOnWorkers({ ...config, numRuns: 100 }, () => {});
  assert.equal(workers.length, 4);
  release();
});

test("runs exactly the requested number of runs", async () => {
  const release = retainWorkerPool();
  let progress = 0;
  await runOnWorkers({ ...config, numRuns: 1001 }, (delta) => {
    progress += delta;
  });
  assert.equal(progress, 1001);
  assert.equal(
    workers.reduce((total, worker) => total + worker.runs, 0),
    1001
  );
  release();
});

test("a slow worker takes fewer runs", async () => {
  const release = retainWorkerPool();
  msPerRun = (index) => (index === 0 ? 0.4 : 0.1);
  await runOnWorkers({ ...config, numRuns: 400 }, () => {});
  const [slow, ...fast] = workers.map((worker) => worker.runs);
  assert.ok(
    fast.every((runs) => runs > slow),
    `slow ${slow}, fast ${fast}`
  );
  release();
});

test("aborting a run replaces the pool while it is still retained", async () => {
  const release = retainWorkerPool();
  msPerRun = () => 1;
  const controller = new AbortController();
  const run = runOnWorkers({ ...config, numRuns: 400 }, () => {}, controller.signal);
  await sleep(5);
  controller.abort();
  await assert.rejects(run, { name: "AbortError" });
  assert.ok(workers.slice(0, 4).every((worker) => worker.terminated));
  await sleep(0);
  assert.equal(workers.length, 8);
  release();
});

test("a worker that fails to load while prewarming is replaced", async () => {
  failToLoad = true;
  const release = retainWorkerPool();
  await sleep(0);
  await sleep(0);
  failToLoad = false;
  await runOnWorkers({ ...config, numRuns: 100 }, () => {});
  assert.equal(workers.length, 8);
  release();
});
