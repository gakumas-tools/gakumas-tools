import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_RUNS_LIMIT,
  placeAmongRuns,
} from "../../../../gakumas-tools/utils/stageListing";

const runs = (...medians) => medians.map((median) => ({ stats: { median } }));

test("placeAmongRuns puts a run after every listed run that scores the same or better", () => {
  assert.deepEqual(placeAmongRuns(runs(9000, 8000, 7000), 8500), {
    index: 1,
    rank: 2,
    below: false,
  });
  assert.deepEqual(placeAmongRuns(runs(9000, 8000, 7000), 8000), {
    index: 2,
    rank: 3,
    below: false,
  });
  assert.deepEqual(placeAmongRuns(runs(9000, 8000), 9500).rank, 1);
});

test("placeAmongRuns ranks last on a short list, and below a full one", () => {
  assert.deepEqual(placeAmongRuns(runs(9000, 8000), 100), {
    index: 2,
    rank: 3,
    below: false,
  });
  const full = runs(...Array.from({ length: STAGE_RUNS_LIMIT }, (_, i) => 9000 - i));
  assert.deepEqual(placeAmongRuns(full, 100), {
    index: STAGE_RUNS_LIMIT,
    rank: null,
    below: true,
  });
  assert.equal(placeAmongRuns(full, 8990.5).rank, 11);
});

test("placeAmongRuns stops at runs with no stats, which the stage lists last", () => {
  const list = [...runs(9000), { stats: null }, {}];
  assert.equal(placeAmongRuns(list, 100).index, 1);
  assert.equal(placeAmongRuns([], 100).rank, 1);
});

test("placeAmongRuns places nothing without a list or a median", () => {
  assert.equal(placeAmongRuns(null, 100), null);
  assert.equal(placeAmongRuns(runs(9000), null), null);
  assert.equal(placeAmongRuns(runs(9000), NaN), null);
});

test("placeAmongRuns ranks by median, as the stage lists runs, not by mean", () => {
  // A run with a higher mean but a lower median sits below yours.
  const listed = [
    { stats: { mean: 900, median: 1000 } },
    { stats: { mean: 2000, median: 700 } },
  ];
  assert.deepEqual(placeAmongRuns(listed, 800), {
    index: 1,
    rank: 2,
    below: false,
  });
});
