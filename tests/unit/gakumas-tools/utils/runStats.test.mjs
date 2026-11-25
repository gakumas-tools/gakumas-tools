import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateRunStats } from "../../../../gakumas-tools/utils/runStats.js";
import { loadoutFromQuery } from "../../../lib.mjs";

// A loadout from the regression suite (seed1-001), as a shared run stores it.
const loadout = loadoutFromQuery(
  "stage=95&support_bonus=0.04&params=1246-3942-798-36&items=132-82-53&cards=1-307-784-777-175-398_535-253-801-265-281-91&customizations=-e33x1---e7x1-_-e27x1e36x1----",
);

test("a shared run is scored by simulating it, whatever stats it carries", async () => {
  const doc = { ...loadout, stats: { mean: 999999 } };
  const result = await simulateRunStats(doc, { numRuns: 200 });
  assert.equal(result.numRuns, 200);
  assert.equal(result.stats.count, 200);
  assert.ok(result.stats.mean > 0 && result.stats.mean < 100000);
  assert.ok(result.stats.min <= result.stats.mean);
  assert.ok(result.stats.mean <= result.stats.max);
});

test("no game stage, no score", async () => {
  for (const stageId of ["custom", 0, 99999999, null]) {
    assert.equal(await simulateRunStats({ ...loadout, stageId }), null);
  }
});

test("too few runs in the time allowed, no score", async () => {
  let t = 0;
  const now = () => (t += 1000);
  assert.equal(
    await simulateRunStats(loadout, { numRuns: 1000, timeLimitMs: 3000, now }),
    null,
  );
});
