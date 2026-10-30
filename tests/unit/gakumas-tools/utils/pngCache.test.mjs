import { test } from "node:test";
import assert from "node:assert/strict";
import { createPngCache } from "../../../../gakumas-tools/utils/pngCache.js";

test("a failed load is retried on the next request", async () => {
  const get = createPngCache(10);
  let calls = 0;
  const load = async () => (++calls === 1 ? null : "data:ok");
  assert.equal(await get("a", load), null);
  assert.equal(await get("a", load), "data:ok");
  assert.equal(await get("a", load), "data:ok");
  assert.equal(calls, 2);
});

test("evicts the least recently used entry past the limit", async () => {
  const get = createPngCache(2);
  const loads = [];
  const load = (key) => async () => {
    loads.push(key);
    return `data:${key}`;
  };
  await get("a", load("a"));
  await get("b", load("b"));
  await get("a", load("a"));
  await get("c", load("c"));
  await get("a", load("a"));
  await get("b", load("b"));
  assert.deepEqual(loads, ["a", "b", "c", "b"]);
});
