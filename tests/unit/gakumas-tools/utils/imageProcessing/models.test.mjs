import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadModel } from "../../../../../gakumas-tools/utils/imageProcessing/models.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a failed session create is retried on the next load", async () => {
  let creates = 0;
  const load = loadModel("/model.onnx", "/classes.json", async () => {
    if (++creates == 1) throw new Error("network");
    return { id: "session" };
  });
  globalThis.fetch = async () => ({ ok: true, json: async () => ["a"] });

  await assert.rejects(load(), /network/);
  assert.deepEqual(await load(), {
    session: { id: "session" },
    classes: ["a"],
  });
  assert.equal(creates, 2);
});

test("a non-ok classes response fails the load and is retried", async () => {
  const load = loadModel("/model.onnx", "/classes.json", async () => ({}));
  let fetches = 0;
  globalThis.fetch = async () =>
    ++fetches == 1
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, json: async () => ["b"] };

  await assert.rejects(load(), /503/);
  assert.deepEqual((await load()).classes, ["b"]);
});

test("a successful load is cached", async () => {
  let creates = 0;
  const load = loadModel("/model.onnx", "/classes.json", async () => ++creates);
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });

  assert.equal(await load(), await load());
  assert.equal(creates, 1);
});
