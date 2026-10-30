import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { mapWithLimit } from "../../../../gakumas-tools/utils/mapWithLimit.js";

async function* items(values, onPull) {
  for (const v of values) {
    onPull?.();
    yield v;
  }
}

test("keeps input order when calls finish out of order", async () => {
  const results = await mapWithLimit(items([5, 1, 3, 2, 4]), 3, async (ms) => {
    await sleep(ms);
    return ms;
  });
  assert.deepEqual(results, [5, 1, 3, 2, 4]);
});

test("keeps pulling items while earlier calls are still running", async () => {
  let pulled = 0;
  let pulledWhileFirstRan = 0;
  await mapWithLimit(
    items([0, 1, 2], () => pulled++),
    3,
    async (i) => {
      if (i === 0) {
        await sleep(10);
        pulledWhileFirstRan = pulled;
      }
    },
  );
  assert.equal(pulledWhileFirstRan, 3);
});

test("never has more than `limit` calls in flight", async () => {
  let running = 0;
  let maxRunning = 0;
  await mapWithLimit(items([3, 1, 4, 1, 5, 9, 2, 6]), 2, async (ms) => {
    maxRunning = Math.max(maxRunning, ++running);
    await sleep(ms);
    running--;
  });
  assert.equal(maxRunning, 2);
});

test("rejects with the first failure and stops pulling", async () => {
  let pulled = 0;
  await assert.rejects(
    mapWithLimit(
      items([0, 1, 2, 3, 4, 5], () => pulled++),
      1,
      async (i) => {
        if (i === 1) throw new Error("boom");
      },
    ),
    /boom/,
  );
  assert.equal(pulled, 2);
});

test("stops pulling once a call fails while the next item is still coming", async () => {
  let pulled = 0;
  async function* slowItems() {
    for (let i = 0; i < 5; i++) {
      pulled++;
      await sleep(5);
      yield i;
    }
  }
  await assert.rejects(
    mapWithLimit(slowItems(), 2, async (i) => {
      if (i === 0) throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(pulled, 2);
});
