import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  BROWSE_PAGE_SIZE,
  STAGE_RUNS_LIMIT,
  browseListedRuns,
  formatCursor,
  getSharedRun,
  isListableStageId,
  isShareId,
  listSharedRuns,
  listStageRuns,
  listedRunStages,
  newShareId,
  ownsSharedRun,
  parseCursor,
  parseStageId,
  refreshStageRuns,
  setListed,
  shareLoadout,
  unshareRun,
} from "../../../../gakumas-tools/utils/sharedRuns.js";

// mongodb is the site's dependency, not the test runner's.
const { ObjectId } = createRequire(
  new URL("../../../../gakumas-tools/package.json", import.meta.url),
)("mongodb");

// Just enough of a MongoDB collection for these queries: equality filters,
// a unique _id, and the projections and sorts the module uses.
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) =>
    value instanceof ObjectId ? value.equals(doc[key]) : doc[key] === value,
  );
}

function fakeDb() {
  const collections = {};
  const collection = (name) =>
    (collections[name] ??= {
      docs: [],
      async findOne(filter) {
        return this.docs.find((doc) => matches(doc, filter)) ?? null;
      },
      find(filter) {
        const found = this.docs.filter((doc) => matches(doc, filter));
        const cursor = {
          sort: () => cursor,
          limit: () => cursor,
          toArray: async () => found,
        };
        return cursor;
      },
      async countDocuments(filter) {
        return this.docs.filter((doc) => matches(doc, filter)).length;
      },
      async insertOne(doc) {
        if (this.docs.some((d) => d._id === doc._id)) {
          throw Object.assign(new Error("duplicate key"), { code: 11000 });
        }
        this.docs.push(doc);
      },
      async updateOne(filter, { $set }) {
        const doc = this.docs.find((d) => matches(d, filter));
        if (doc) Object.assign(doc, $set);
      },
      async deleteOne(filter) {
        const index = this.docs.findIndex((d) => matches(d, filter));
        if (index < 0) return { deletedCount: 0 };
        this.docs.splice(index, 1);
        return { deletedCount: 1 };
      },
    });
  return { collection, collections };
}

const loadoutId = new ObjectId();
const savedRun = {
  _id: loadoutId,
  name: "Saki final",
  stageId: 52,
  enterPercents: false,
  customStage: { turnCounts: { vocal: 4, dance: 3, visual: 4 } },
  supportBonus: 0.04,
  params: [1500, 1400, 1300, 50],
  pItemIds: [116, 1, 0, 0],
  skillCardIdGroups: [[2, 13, 38, 125]],
  customizationGroups: [[{}, {}, {}, {}]],
  linkLoadouts: null,
  stats: { averageScore: 1979, minScore: 1500, maxScore: 2400 },
  derived: { label: "x" },
  userId: "owner",
  createdAt: new Date("2026-11-01"),
};

function dbWithSavedRun() {
  const db = fakeDb();
  db.collection("loadouts").docs.push({ ...savedRun });
  return db;
}

test("share ids are 8 letters and digits", () => {
  for (let i = 0; i < 100; i++) assert.ok(isShareId(newShareId()));
  for (const bad of ["abc", "abcdefgh1", "abcd-efg", 12345678, null]) {
    assert.equal(isShareId(bad), false);
  }
});

test("sharing a saved run makes a public copy without its owner", async () => {
  const db = dbWithSavedRun();
  const { id } = await shareLoadout(db, "owner", loadoutId.toString());
  assert.ok(isShareId(id));

  const run = await getSharedRun(db, id);
  assert.equal(run.id, id);
  assert.equal(run.name, "Saki final");
  assert.deepEqual(run.skillCardIdGroups, savedRun.skillCardIdGroups);
  assert.deepEqual(run.customStage, savedRun.customStage);
  assert.deepEqual(run.stats, savedRun.stats);
  assert.equal("userId" in run, false);
  assert.equal("sourceId" in run, false);
  assert.equal("_id" in run, false);
});

test("only the owner can share a saved run", async () => {
  const db = dbWithSavedRun();
  assert.deepEqual(await shareLoadout(db, "someone", loadoutId.toString()), {
    error: "Not found",
    status: 404,
  });
  assert.equal((await shareLoadout(db, "owner", "nope")).status, 400);
  assert.equal(db.collection("sharedRuns").docs.length, 0);
});

test("sharing the same run again gives the same link, with its new name", async () => {
  const db = dbWithSavedRun();
  const first = await shareLoadout(db, "owner", loadoutId.toString());
  db.collection("loadouts").docs[0].name = "Saki final (renamed)";
  const second = await shareLoadout(db, "owner", loadoutId.toString());
  assert.equal(second.id, first.id);
  assert.equal(db.collection("sharedRuns").docs.length, 1);
  assert.equal((await getSharedRun(db, first.id)).name, "Saki final (renamed)");
});

test("a taken id is skipped", async () => {
  const db = dbWithSavedRun();
  db.collection("sharedRuns").docs.push({ _id: "AAAAAAAA", userId: "other" });
  const ids = ["AAAAAAAA", "BBBBBBBB"];
  const { id } = await shareLoadout(db, "owner", loadoutId.toString(), () =>
    ids.shift(),
  );
  assert.equal(id, "BBBBBBBB");
});

test("the shared copy outlives the saved run, until its owner takes it down", async () => {
  const db = dbWithSavedRun();
  const { id } = await shareLoadout(db, "owner", loadoutId.toString());
  db.collection("loadouts").docs.length = 0;
  assert.ok(await getSharedRun(db, id));

  assert.deepEqual(
    (await listSharedRuns(db, "owner")).map((r) => r._id),
    [id],
  );
  assert.equal(await unshareRun(db, "someone", id), false);
  assert.ok(await getSharedRun(db, id));
  assert.equal(await unshareRun(db, "owner", id), true);
  assert.equal(await getSharedRun(db, id), null);
});

test("unknown or malformed ids find nothing", async () => {
  const db = fakeDb();
  assert.equal(await getSharedRun(db, "ZZZZZZZZ"), null);
  assert.equal(await getSharedRun(db, { $ne: null }), null);
  assert.equal(await unshareRun(db, "owner", { $ne: null }), false);
});

// The listing tests need a collection that also sorts on (dotted) fields,
// with missing values lowest, limits, and says how many docs an update
// matched.
function valueAt(doc, path) {
  return path.split(".").reduce((value, key) => value?.[key], doc);
}

function listingDb() {
  const collections = {};
  const collection = (name) =>
    (collections[name] ??= {
      docs: [],
      async findOne(filter) {
        return this.docs.find((doc) => matches(doc, filter)) ?? null;
      },
      find(filter) {
        let found = this.docs.filter((doc) => matches(doc, filter));
        const cursor = {
          sort(spec) {
            const keys = Object.entries(spec);
            found = [...found].sort((a, b) => {
              for (const [key, dir] of keys) {
                const av = valueAt(a, key);
                const bv = valueAt(b, key);
                if (av === bv) continue;
                if (av == null) return -dir;
                if (bv == null) return dir;
                return av < bv ? -dir : dir;
              }
              return 0;
            });
            return cursor;
          },
          limit(n) {
            found = found.slice(0, n);
            return cursor;
          },
          toArray: async () => found,
        };
        return cursor;
      },
      async countDocuments(filter) {
        return this.docs.filter((doc) => matches(doc, filter)).length;
      },
      async insertOne(doc) {
        if (this.docs.some((d) => d._id === doc._id)) {
          throw Object.assign(new Error("duplicate key"), { code: 11000 });
        }
        this.docs.push(doc);
      },
      async updateOne(filter, { $set }) {
        const doc = this.docs.find((d) => matches(d, filter));
        if (doc) Object.assign(doc, $set);
        return { matchedCount: doc ? 1 : 0 };
      },
      async deleteOne(filter) {
        const index = this.docs.findIndex((d) => matches(d, filter));
        if (index < 0) return { deletedCount: 0 };
        this.docs.splice(index, 1);
        return { deletedCount: 1 };
      },
    });
  return { collection, collections };
}

// Shares n saved runs of one stage, each with its own mean score.
async function shareRuns(db, means, { stageId = 52, userId = "owner" } = {}) {
  const ids = [];
  for (const mean of means) {
    const _id = new ObjectId();
    db.collection("loadouts").docs.push({
      ...savedRun,
      _id,
      stageId,
      userId,
      name: `run ${mean}`,
      stats: mean == null ? null : { mean, median: mean, min: 0, max: mean },
    });
    ids.push((await shareLoadout(db, userId, _id.toString())).id);
  }
  return ids;
}

// Stands in for the engine: the server's mean is the one in the run's name
// ("run 2400"), whatever its stats field says; "run null" can't be
// simulated.
async function fakeSimulate(doc) {
  const mean = Number(doc.name?.split(" ")[1]);
  if (!Number.isFinite(mean)) return null;
  return { stats: { mean, median: mean, min: 0, max: mean }, numRuns: 1000 };
}
const list = (db, userId, id, listed = true) =>
  setListed(db, userId, id, listed, fakeSimulate);

test("a shared run is unlisted until its owner lists it", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  assert.equal(db.collection("sharedRuns").docs[0].listed, false);
  assert.deepEqual(await listStageRuns(db, 52), []);

  assert.equal((await list(db, "someone", id)).status, 404);
  assert.deepEqual(await listStageRuns(db, 52), []);

  assert.deepEqual(await list(db, "owner", id), { ok: true });
  assert.deepEqual(
    (await listStageRuns(db, 52)).map((r) => r.id),
    [id],
  );
  assert.deepEqual(await list(db, "owner", id, false), { ok: true });
  assert.deepEqual(await listStageRuns(db, 52), []);
});

test("listing takes only a real id and a boolean", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  assert.equal((await list(db, "owner", id, "yes")).status, 404);
  assert.equal((await list(db, "owner", { $ne: null })).status, 404);
  assert.equal((await list(db, "owner", "ZZZZZZZZ")).status, 404);
  assert.equal(db.collection("sharedRuns").docs[0].listed, false);
});

test("re-sharing a listed run keeps it listed", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  await list(db, "owner", id);
  const { sourceId } = db.collection("sharedRuns").docs[0];
  assert.equal((await shareLoadout(db, "owner", sourceId.toString())).id, id);
  assert.equal((await listStageRuns(db, 52)).length, 1);
});

test("a stage's listing is its own listed runs, best server mean first, without owners", async () => {
  const db = listingDb();
  const ids = await shareRuns(db, [1500, 2400, 1900]);
  const [other] = await shareRuns(db, [9999], { stageId: 53 });
  for (const id of [...ids, other]) await list(db, "owner", id);

  const runs = await listStageRuns(db, 52);
  assert.deepEqual(
    runs.map((r) => r.name),
    ["run 2400", "run 1900", "run 1500"],
  );
  for (const run of runs) {
    assert.ok(isShareId(run.id));
    assert.equal(run.stats.numRuns, 1000);
    for (const field of ["userId", "sourceId", "_id", "listed", "serverStats"]) {
      assert.equal(field in run, false);
    }
  }
  assert.deepEqual(
    (await listStageRuns(db, 53)).map((r) => r.id),
    [other],
  );
});

test("forged stats don't move a run up: the stage page ranks and shows the server's", async () => {
  const db = listingDb();
  const [honest, forged] = await shareRuns(db, [2400, 1500]);
  // The browser can send any stats with a saved run.
  db.collection("sharedRuns").docs[1].stats = { mean: 999999, median: 999999 };
  for (const id of [honest, forged]) await list(db, "owner", id);

  const runs = await listStageRuns(db, 52);
  assert.deepEqual(runs.map((r) => r.id), [honest, forged]);
  assert.equal(runs[1].stats.mean, 1500);
});

test("a listed run's own page shows the server's stats too, not forged ones", async () => {
  const db = listingDb();
  const [forged, unlisted] = await shareRuns(db, [1500, 2400]);
  db.collection("sharedRuns").docs[0].stats = { mean: 999999, median: 999999 };
  await list(db, "owner", forged);

  const run = await getSharedRun(db, forged);
  assert.equal(run.stats.mean, 1500);
  assert.equal("version" in run.stats, false);
  // Never listed, so there are only the owner's stats to show.
  const own = db.collection("sharedRuns").docs[1].stats;
  assert.deepEqual((await getSharedRun(db, unlisted)).stats, own);
});

test("a run the server can't simulate isn't listed", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [null]);
  assert.equal((await list(db, "owner", id)).status, 422);
  assert.equal(db.collection("sharedRuns").docs[0].listed, false);
  assert.deepEqual(await listStageRuns(db, 52), []);
});

test("a listed run is simulated once per engine version, not on every re-list", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  let calls = 0;
  const counting = async (doc) => (calls++, fakeSimulate(doc));
  await setListed(db, "owner", id, true, counting, "v1");
  await setListed(db, "owner", id, false, counting, "v1");
  await setListed(db, "owner", id, true, counting, "v1");
  assert.equal(calls, 1);
  await setListed(db, "owner", id, false, counting, "v2");
  await setListed(db, "owner", id, true, counting, "v2");
  assert.equal(calls, 2);
  assert.equal(db.collection("sharedRuns").docs[0].serverStats.version, "v2");
});

// The engine after a fix: every run scores 10 more than before.
const fixedEngine = async (doc) => {
  const before = await fakeSimulate(doc);
  if (!before) return null;
  const mean = before.stats.mean + 10;
  return { stats: { ...before.stats, mean, max: mean }, numRuns: 1000 };
};

test("a new engine version re-simulates a stage's listed runs, a few at a time", async () => {
  const db = listingDb();
  const ids = await shareRuns(db, [1500, 2400, 1900]);
  for (const id of ids) await setListed(db, "owner", id, true, fakeSimulate, "v1");
  const means = async () => (await listStageRuns(db, 52)).map((r) => r.stats.mean);

  // Same version: nothing to do.
  assert.equal(await refreshStageRuns(db, 52, "v1", { simulate: fixedEngine }), 0);
  assert.deepEqual(await means(), [2400, 1900, 1500]);

  assert.equal(await refreshStageRuns(db, 52, "v2", { simulate: fixedEngine }), 1);
  assert.deepEqual(await means(), [2410, 1900, 1500]);
  assert.equal(
    await refreshStageRuns(db, 52, "v2", { simulate: fixedEngine, max: 5 }),
    2,
  );
  assert.deepEqual(await means(), [2410, 1910, 1510]);
  assert.equal(await refreshStageRuns(db, 52, "v2", { simulate: fixedEngine }), 0);
  // The engine version is stored, not shown.
  for (const run of await listStageRuns(db, 52)) {
    assert.equal("version" in run.stats, false);
  }
});

test("a run the new engine can't simulate keeps its stats and isn't retried", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  await setListed(db, "owner", id, true, fakeSimulate, "v1");
  let calls = 0;
  const failing = async () => (calls++, null);
  assert.equal(await refreshStageRuns(db, 52, "v2", { simulate: failing }), 1);
  assert.equal(await refreshStageRuns(db, 52, "v2", { simulate: failing }), 0);
  assert.equal(calls, 1);
  assert.equal((await listStageRuns(db, 52))[0].stats.mean, 2000);
});

test("without a known engine version, stored stats stand", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  await list(db, "owner", id);
  assert.equal(await refreshStageRuns(db, 52, null, { simulate: fixedEngine }), 0);
  assert.equal((await listStageRuns(db, 52))[0].stats.mean, 2000);
});

test("unlisted and other stages' runs aren't re-simulated", async () => {
  const db = listingDb();
  const [listed, hidden] = await shareRuns(db, [2000, 2100]);
  const [other] = await shareRuns(db, [2200], { stageId: 53 });
  for (const id of [listed, hidden, other]) {
    await setListed(db, "owner", id, true, fakeSimulate, "v1");
  }
  await setListed(db, "owner", hidden, false, fakeSimulate, "v1");
  assert.equal(
    await refreshStageRuns(db, 52, "v2", { simulate: fixedEngine, max: 10 }),
    1,
  );
  const docs = db.collection("sharedRuns").docs;
  assert.equal(docs.find((d) => d._id === hidden).serverStats.mean, 2100);
  assert.equal(docs.find((d) => d._id === other).serverStats.mean, 2200);
});

test("a stage's listing is capped", async () => {
  const db = listingDb();
  const means = Array.from({ length: 60 }, (_, i) => 1000 + i);
  for (const id of await shareRuns(db, means)) await list(db, "owner", id);
  assert.equal((await listStageRuns(db, 52)).length, STAGE_RUNS_LIMIT);
  assert.equal((await listStageRuns(db, 52, 5))[0].name, "run 1059");
  assert.equal((await listStageRuns(db, 52, 1000)).length, 50);
});

test("custom and malformed stages have no listing", async () => {
  const db = listingDb();
  for (const bad of ["custom", "52", 0, -1, 1.5, null, { $ne: null }]) {
    assert.equal(isListableStageId(bad), false);
    assert.deepEqual(await listStageRuns(db, bad), []);
  }
  assert.equal(isListableStageId(52), true);
  const [id] = await shareRuns(db, [2000], { stageId: "custom" });
  assert.equal((await list(db, "owner", id)).status, 400);
});

test("the owner's list says which shared runs are listed", async () => {
  const db = listingDb();
  const [id] = await shareRuns(db, [2000]);
  await list(db, "owner", id);
  assert.equal((await listSharedRuns(db, "owner"))[0].listed, true);
});

// The /shared page. A collection fake for its queries: equality, $lt, $or,
// an inclusion projection, sort by createdAt then _id (both descending), a
// limit, and the one aggregate pipeline the module runs.
function fakeBrowse(docs) {
  const calls = {};
  const test = (value, cond) => {
    if (cond && typeof cond == "object" && !(cond instanceof Date)) {
      if ("$lt" in cond) return value < cond.$lt;
    }
    return cond instanceof Date ? +value === +cond : value === cond;
  };
  const matches = (doc, filter) =>
    Object.entries(filter).every(([key, cond]) =>
      key == "$or"
        ? cond.some((f) => matches(doc, f))
        : test(doc[key], cond),
    );
  const collection = {
    find(filter, options) {
      calls.find = { filter, options };
      let found = docs.filter((doc) => matches(doc, filter));
      const cursor = {
        sort(spec) {
          calls.sort = spec;
          found = [...found].sort(
            (a, b) => b.createdAt - a.createdAt || (a._id < b._id ? 1 : -1),
          );
          return cursor;
        },
        limit(n) {
          found = found.slice(0, n);
          return cursor;
        },
        toArray: async () =>
          found.map((doc) =>
            Object.fromEntries(
              Object.entries(doc).filter(
                ([key]) => options.projection[key] === 1,
              ),
            ),
          ),
      };
      return cursor;
    },
    aggregate(pipeline) {
      calls.aggregate = pipeline;
      const groups = new Map();
      for (const doc of docs) {
        if (doc.listed !== true) continue;
        if (typeof doc.stageId != "number" || !(doc.stageId > 0)) continue;
        const group = groups.get(doc.stageId) ?? {
          _id: doc.stageId,
          count: 0,
          latest: new Date(0),
        };
        group.count++;
        if (doc.createdAt > group.latest) group.latest = doc.createdAt;
        groups.set(doc.stageId, group);
      }
      const sorted = [...groups.values()].sort((a, b) => b.latest - a.latest);
      return { toArray: async () => sorted };
    },
  };
  return { db: { collection: () => collection }, calls };
}

const T0 = Date.UTC(2026, 10, 1);
function listedDoc(i, stageId, { listed = true, at = i } = {}) {
  return {
    _id: `run${String(i).padStart(5, "0")}`,
    name: `Run ${i}`,
    stageId,
    userId: "secret-owner",
    sourceId: "secret-source",
    pItemIds: [1],
    skillCardIdGroups: [[2]],
    stats: { mean: 999999 },
    serverStats: { mean: 1000 + i, median: 1000 + i, version: "abc" },
    listed,
    createdAt: new Date(T0 + at * 60_000),
  };
}

test("parseStageId takes a game stage's id only", () => {
  assert.equal(parseStageId("52"), 52);
  for (const bad of ["0", "-3", "custom", "5e2", "052", "", undefined]) {
    assert.equal(parseStageId(bad), null, String(bad));
  }
  assert.equal(parseStageId(["52"]), null);
});

test("a paging cursor round-trips and rejects anything else", () => {
  const run = { id: "Ab3dEf7h", createdAt: new Date(T0) };
  const cursor = parseCursor(formatCursor(run));
  assert.equal(cursor.id, "Ab3dEf7h");
  assert.equal(+cursor.createdAt, T0);
  for (const bad of ["yesterday", "", "2026-11-01T00:00:00Z", "x~Ab3dEf7h", "2026-11-01T00:00:00Z~bad", undefined]) {
    assert.equal(parseCursor(bad), null, String(bad));
  }
});

test("/shared shows only listed runs, without owners, with the server's stats", async () => {
  const { db, calls } = fakeBrowse([
    listedDoc(1, 52),
    listedDoc(2, 52, { listed: false }),
  ]);
  const { runs, next } = await browseListedRuns(db);
  assert.equal(calls.find.filter.listed, true);
  assert.equal(calls.find.options.projection.userId, undefined);
  assert.equal(calls.find.options.projection.sourceId, undefined);
  assert.deepEqual(runs.map((run) => run.id), ["run00001"]);
  assert.equal("userId" in runs[0], false);
  assert.equal("sourceId" in runs[0], false);
  assert.deepEqual(runs[0].stats, { mean: 1001, median: 1001 });
  assert.equal(next, null);
});

test("/shared for one stage is that stage's listed runs, newest first", async () => {
  const { db, calls } = fakeBrowse([
    listedDoc(1, 52),
    listedDoc(2, 53),
    listedDoc(3, 52),
  ]);
  const { runs } = await browseListedRuns(db, { stageId: 52 });
  assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 });
  assert.deepEqual(runs.map((run) => run.id), ["run00003", "run00001"]);
});

test("/shared has nothing for a custom or malformed stage", async () => {
  const { db } = fakeBrowse([listedDoc(1, 52)]);
  for (const stageId of [0, -1, 1.5, "52"]) {
    assert.deepEqual(await browseListedRuns(db, { stageId }), {
      runs: [],
      next: null,
    });
  }
});

test("pages carry on from the last run, even through runs listed in the same instant", async () => {
  // Every run made at the same moment: only the id tells them apart.
  const docs = Array.from({ length: BROWSE_PAGE_SIZE + 5 }, (_, i) =>
    listedDoc(i, 52, { at: 0 }),
  );
  const { db } = fakeBrowse(docs);
  const first = await browseListedRuns(db, { stageId: 52 });
  assert.equal(first.runs.length, BROWSE_PAGE_SIZE);
  const second = await browseListedRuns(db, {
    stageId: 52,
    after: parseCursor(first.next),
  });
  assert.equal(second.runs.length, 5);
  assert.equal(second.next, null);
  const seen = new Set([...first.runs, ...second.runs].map((run) => run.id));
  assert.equal(seen.size, docs.length);
});

test("the stage picker counts listed runs on game stages, latest first", async () => {
  const { db, calls } = fakeBrowse([
    listedDoc(1, 52),
    listedDoc(2, 53),
    listedDoc(3, 52),
    listedDoc(4, 54, { listed: false }),
    listedDoc(5, null),
  ]);
  assert.deepEqual(calls.aggregate, undefined);
  assert.deepEqual(await listedRunStages(db), [
    { stageId: 52, count: 2 },
    { stageId: 53, count: 1 },
  ]);
  assert.deepEqual(calls.aggregate[0], {
    $match: { listed: true, stageId: { $type: "number", $gt: 0 } },
  });
});

test("ownsSharedRun is true only for the user who shared the run", async () => {
  const db = fakeDb();
  db.collection("sharedRuns").docs.push({ _id: "AAAAAAAA", userId: "me" });
  assert.equal(await ownsSharedRun(db, "AAAAAAAA", "me"), true);
  assert.equal(await ownsSharedRun(db, "AAAAAAAA", "other"), false);
  assert.equal(await ownsSharedRun(db, "BBBBBBBB", "me"), false);
  assert.equal(await ownsSharedRun(db, "AAAAAAAA", null), false);
  assert.equal(await ownsSharedRun(db, "not an id", "me"), false);
});

test("a stage's listed runs are ranked by the server's median", async () => {
  const sorts = [];
  const cursor = {
    sort: (spec) => (sorts.push(spec), cursor),
    limit: () => cursor,
    toArray: async () => [],
  };
  const db = { collection: () => ({ find: () => cursor }) };
  await listStageRuns(db, 52);
  await refreshStageRuns(db, 52, "v1");
  assert.deepEqual(sorts, [
    { "serverStats.median": -1, createdAt: -1 },
    { "serverStats.median": -1, createdAt: -1 },
  ]);
});
