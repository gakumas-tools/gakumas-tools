import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLayoutsInWorker } from "../../../../gakumas-tools/simulator/loadoutOptimizer.js";

let worker;
class FakeWorker extends EventTarget {
  constructor() {
    super();
    worker = this;
    this.terminated = false;
  }

  postMessage(input) {
    this.input = input;
  }

  terminate() {
    this.terminated = true;
  }

  reply(data) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
globalThis.Worker = FakeWorker;

const options = (overrides) => ({
  signal: new AbortController().signal,
  onProgress: () => {},
  ...overrides,
});

test("progress is passed on and the result ends the worker", async () => {
  const progress = [];
  const pending = compareLayoutsInWorker(
    "input",
    options({
      onProgress: (completed, total) => progress.push([completed, total]),
    }),
  );
  assert.equal(worker.input, "input");
  worker.reply({ type: "progress", completed: 32, total: 700 });
  worker.reply({ type: "result", result: { selectedId: "current" } });
  assert.deepEqual(await pending, { selectedId: "current" });
  assert.deepEqual(progress, [[32, 700]]);
  assert.equal(worker.terminated, true);
});

test("aborting ends the worker and rejects", async () => {
  const controller = new AbortController();
  const pending = compareLayoutsInWorker(
    "input",
    options({ signal: controller.signal }),
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(worker.terminated, true);
});

test("an error from the comparison or the worker itself rejects", async () => {
  const failed = compareLayoutsInWorker("input", options());
  worker.reply({ type: "error", message: "Stage 121 is not a contest" });
  await assert.rejects(failed, /Stage 121/);
  assert.equal(worker.terminated, true);

  const crashed = compareLayoutsInWorker("input", options());
  worker.dispatchEvent(
    Object.assign(new Event("error"), { message: "failed to load" }),
  );
  await assert.rejects(crashed, /failed to load/);
  assert.equal(worker.terminated, true);
});
