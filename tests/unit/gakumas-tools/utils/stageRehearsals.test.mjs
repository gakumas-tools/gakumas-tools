import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_GAP_MIN_SOURCES,
  stageGapSummary,
} from "../../../../gakumas-tools/utils/rehearsalComparison.js";
import {
  COMPARISONS,
  STAGE_GAP_DAYS,
  refreshStageComparisons,
  stageRehearsalGap,
} from "../../../../gakumas-tools/utils/stageRehearsals.js";

// Gaps to 4 places, so float error doesn't fail an equal.
const rounded = (summary) =>
  summary && {
    ...summary,
    medianGap: Math.round(summary.medianGap * 1e4) / 1e4,
    medianAbsGap: Math.round(summary.medianAbsGap * 1e4) / 1e4,
  };

// A comparison whose rehearsal picked stage 1, slot 1; the other cells are far
// from anything the tests simulate, so they never look like a mis-pick.
function comparison(source, scores, simMean, extra = {}) {
  const far = [1, 1, 1];
  return {
    loadout: {
      stageId: 52,
      pItemIds: [source.length, ...[...source].map((ch) => ch.charCodeAt(0))],
    },
    enterPercents: false,
    rehearsal: {
      stage: 1,
      slot: 1,
      scores,
      grid: [
        [scores, far, far],
        [far, far, far],
        [far, far, far],
      ],
    },
    simMean,
    ipHash: source,
    userHash: null,
    ...extra,
  };
}

test("stageGapSummary needs comparisons from three players", () => {
  const two = [
    comparison("a", [1000, 1000, 1000], 1010),
    comparison("b", [1000, 1000, 1000], 980),
    comparison("b", [2000, 2000, 2000], 2000),
  ];
  assert.equal(STAGE_GAP_MIN_SOURCES, 3);
  assert.equal(stageGapSummary(two), null);
  const three = [...two, comparison("c", [1000, 1000, 1000], 1050)];
  assert.deepEqual(rounded(stageGapSummary(three)), {
    count: 4,
    sources: 3,
    medianGap: 0.005,
    medianAbsGap: 0.015,
  });
});

test("a signed-in player is one source on any network", () => {
  const list = [
    comparison("a", [1000, 1000, 1000], 1000, { userHash: "u1" }),
    comparison("b", [1001, 1000, 1000], 1000, { userHash: "u1" }),
    comparison("c", [1002, 1000, 1000], 1000),
  ];
  assert.equal(stageGapSummary(list), null);
});

test("stageGapSummary counts a comparison shared twice once", () => {
  const same = comparison("a", [1000, 1000, 1000], 1100);
  const list = [
    same,
    { ...same, ipHash: "a2" },
    comparison("b", [1000, 1000, 1000], 1000),
    comparison("c", [1000, 1000, 1000], 1000),
  ];
  // The copy from "a2" replaces the first, so three players, three entries.
  assert.equal(stageGapSummary(list).count, 3);
});

test("stageGapSummary leaves out likely mis-picks, thin rehearsals and unsimulated ones", () => {
  const misPicked = comparison("d", [1000, 1000, 1000], 3000);
  misPicked.rehearsal.grid[1][1] = [3000, 3000, 3000];
  const list = [
    comparison("a", [1000, 1000, 1000], 1020),
    comparison("b", [1000, 1000, 1000], 1020),
    comparison("c", [1000, 1000, 1000], 1020),
    misPicked,
    comparison("e", [1000, 1000], 1500),
    comparison("f", [1000, 1000, 1000], undefined),
    comparison("", [1000, 1000, 1000], 1500),
  ];
  assert.deepEqual(rounded(stageGapSummary(list)), {
    count: 3,
    sources: 3,
    medianGap: 0.02,
    medianAbsGap: 0.02,
  });
});

// Just enough of a MongoDB collection for these queries.
function fakeDb(docs) {
  const inFilter = (doc, filter) =>
    doc.loadout.stageId === filter["loadout.stageId"] &&
    doc.updatedAt >= filter.updatedAt.$gte;
  const collection = {
    docs,
    find(filter) {
      const found = docs.filter((doc) => inFilter(doc, filter));
      const cursor = {
        sort: () => cursor,
        limit: () => cursor,
        toArray: async () => found.map((doc) => structuredClone(doc)),
      };
      return cursor;
    },
    async updateOne({ _id }, { $set }) {
      Object.assign(
        docs.find((doc) => doc._id === _id),
        $set,
      );
    },
  };
  return {
    collection: (name) => {
      assert.equal(name, COMPARISONS);
      return collection;
    },
  };
}

const NOW = new Date("2026-11-25T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function stored(id, source, scores, { days = 1, stageId = 52, ...rest } = {}) {
  const { simMean, ...doc } = comparison(source, scores, undefined);
  return {
    ...doc,
    _id: id,
    loadout: { ...doc.loadout, stageId },
    updatedAt: daysAgo(days),
    ...rest,
  };
}

// An engine whose mean is the comparison's first P-item id times 500.
const engine = async (doc) =>
  doc.pItemIds[0] == 9
    ? null
    : { stats: { mean: doc.pItemIds[0] * 500 }, numRuns: 1000 };

test("the stage line uses only the server's simulation of each comparison", async () => {
  const docs = [
    stored("1", "aa", [1000, 1000, 1000], { simStats: { mean: 5000 } }),
    stored("2", "bb", [1000, 1000, 1000]),
    stored("3", "cc", [1000, 1000, 1000]),
    stored("4", "dd", [1000, 1000, 1000], { days: STAGE_GAP_DAYS + 1 }),
    stored("5", "ee", [1000, 1000, 1000], { stageId: 53 }),
  ];
  const db = fakeDb(docs);
  assert.equal(await stageRehearsalGap(db, 52, { now: NOW }), null);

  const refresh = (version, max) =>
    refreshStageComparisons(db, 52, version, { simulate: engine, max, now: NOW });
  assert.equal(await refresh("v1", 2), 2);
  assert.equal(await stageRehearsalGap(db, 52, { now: NOW }), null);
  assert.equal(await refresh("v1", 5), 1);
  assert.equal(await refresh("v1", 5), 0);
  assert.equal(docs[3].serverSim, undefined);
  assert.equal(docs[4].serverSim, undefined);
  assert.deepEqual(docs[0].serverSim, { mean: 1000, numRuns: 1000, version: "v1" });
  assert.deepEqual(await stageRehearsalGap(db, 52, { now: NOW }), {
    count: 3,
    sources: 3,
    medianGap: 0,
    medianAbsGap: 0,
  });

  // A new deploy simulates them again, and the old result counts meanwhile.
  assert.equal(await refresh("v2", 1), 1);
  assert.equal((await stageRehearsalGap(db, 52, { now: NOW })).count, 3);
  assert.equal(await refresh("v2", 5), 2);
  assert.equal(await refresh("v2", 5), 0);
});

test("a comparison the engine can't simulate isn't tried again on that version", async () => {
  const docs = [stored("1", "aaaaaaaaa", [1000, 1000, 1000])];
  const db = fakeDb(docs);
  const refresh = (version) =>
    refreshStageComparisons(db, 52, version, { simulate: engine, now: NOW });
  assert.equal(await refresh("v1"), 1);
  assert.equal(docs[0].serverSimTried, "v1");
  assert.equal(await refresh("v1"), 0);
  assert.equal(await refresh("v2"), 1);
  // A local build has no version and simulates only what has never been.
  assert.equal(await refresh(null), 1);
  assert.equal(await refresh(null), 0);
});

test("custom stages have no line", async () => {
  const db = fakeDb([]);
  assert.equal(await stageRehearsalGap(db, -1, { now: NOW }), null);
  assert.equal(await refreshStageComparisons(db, -1, "v1", { now: NOW }), 0);
});
