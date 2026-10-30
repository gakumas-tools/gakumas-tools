import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createWorkerPool } from "../../../../gakumas-tools/utils/workerPool.js";

function trackedPool(opts) {
  const created = [];
  const destroyed = [];
  const pool = createWorkerPool({
    size: 2,
    idleMs: 20,
    create: async () => {
      const worker = { id: created.length };
      created.push(worker);
      return worker;
    },
    destroy: (worker) => destroyed.push(worker),
    ...opts,
  });
  return { pool, created, destroyed };
}

test("never runs more than `size` tasks at once and keeps result order", async () => {
  const { pool, created } = trackedPool();
  let running = 0;
  let maxRunning = 0;
  const results = await Promise.all(
    [5, 1, 3, 2, 4, 1].map((ms, i) =>
      pool.run(async () => {
        maxRunning = Math.max(maxRunning, ++running);
        await sleep(ms);
        running--;
        return i;
      }),
    ),
  );
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(maxRunning, 2);
  assert.equal(created.length, 2);
  pool.close();
});

test("reuses an idle worker for sequential tasks", async () => {
  const { pool, created } = trackedPool();
  for (let i = 0; i < 5; i++) await pool.run(async () => {});
  assert.equal(created.length, 1);
  pool.close();
});

test("replaces a worker whose task threw", async () => {
  const { pool, created, destroyed } = trackedPool({ size: 1 });
  await assert.rejects(
    pool.run(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  const worker = await pool.run(async (w) => w);
  assert.deepEqual(destroyed, [created[0]]);
  assert.equal(worker, created[1]);
  pool.close();
});

test("destroys idle workers after idleMs", async () => {
  const { pool, created, destroyed } = trackedPool();
  await Promise.all([pool.run(() => sleep(5)), pool.run(() => sleep(5))]);
  assert.equal(destroyed.length, 0);
  await sleep(50);
  assert.deepEqual(new Set(destroyed), new Set(created));
});

test("close destroys workers, including ones still busy", async () => {
  const { pool, created, destroyed } = trackedPool();
  await pool.run(async () => {});
  const busy = pool.run(() => sleep(10));
  await sleep(0);
  pool.close();
  assert.equal(destroyed.length, 0);
  await busy;
  await sleep(0);
  assert.deepEqual(destroyed, created);
});

test("a failed create rejects the task and frees the slot", async () => {
  let attempts = 0;
  const { pool } = trackedPool({
    size: 1,
    create: async () => {
      if (attempts++ === 0) throw new Error("offline");
      return {};
    },
  });
  await assert.rejects(
    pool.run(async () => {}),
    /offline/,
  );
  assert.equal(await pool.run(async () => "ok"), "ok");
  pool.close();
});

test("close rejects queued tasks and later runs, but lets busy ones finish", async () => {
  const { pool } = trackedPool({ size: 1 });
  const busy = pool.run(async () => {
    await sleep(10);
    return "done";
  });
  const queued = pool.run(async () => "never");
  await sleep(0);
  pool.close();
  await assert.rejects(queued, /closed/);
  await assert.rejects(
    pool.run(async () => "late"),
    /closed/,
  );
  assert.equal(await busy, "done");
});
