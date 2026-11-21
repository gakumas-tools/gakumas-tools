import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  STAGE_RUNS_LIMIT,
  getSharedRun,
  isListableStageId,
  isShareId,
  listSharedRuns,
  listStageRuns,
  newShareId,
  setListed,
  shareLoadout,
  unshareRun,
} from "../../../../gakumas-tools/utils/sharedRuns.js";

// mongodb is the site's dependency, not the test runner's.
const { ObjectId } = createRequire(
  new URL("../../../../gakumas-tools/package.json", import.meta.url),
)("mongodb");

// Just enough of a MongoDB collection for these queries: equality filters,
// a unique _id, sorts on (dotted) fields with missing values lowest, and
// limits.
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) =>
    value instanceof ObjectId ? value.equals(doc[key]) : doc[key] === value,
  );
}

function valueAt(doc, path) {
  return path.split(".").reduce((value, key) => value?.[key], doc);
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

test("a shared run is unlisted until its owner lists it", async () => {
  const db = fakeDb();
  const [id] = await shareRuns(db, [2000]);
  assert.equal(db.collection("sharedRuns").docs[0].listed, false);
  assert.deepEqual(await listStageRuns(db, 52), []);

  assert.equal(await setListed(db, "someone", id, true), false);
  assert.deepEqual(await listStageRuns(db, 52), []);

  assert.equal(await setListed(db, "owner", id, true), true);
  assert.deepEqual(
    (await listStageRuns(db, 52)).map((r) => r.id),
    [id],
  );
  assert.equal(await setListed(db, "owner", id, false), true);
  assert.deepEqual(await listStageRuns(db, 52), []);
});

test("listing takes only a real id and a boolean", async () => {
  const db = fakeDb();
  const [id] = await shareRuns(db, [2000]);
  assert.equal(await setListed(db, "owner", id, "yes"), false);
  assert.equal(await setListed(db, "owner", { $ne: null }, true), false);
  assert.equal(await setListed(db, "owner", "ZZZZZZZZ", true), false);
  assert.equal(db.collection("sharedRuns").docs[0].listed, false);
});

test("re-sharing a listed run keeps it listed", async () => {
  const db = fakeDb();
  const [id] = await shareRuns(db, [2000]);
  await setListed(db, "owner", id, true);
  const { sourceId } = db.collection("sharedRuns").docs[0];
  assert.equal((await shareLoadout(db, "owner", sourceId.toString())).id, id);
  assert.equal((await listStageRuns(db, 52)).length, 1);
});

test("a stage's listing is its own listed runs, best mean first, without owners", async () => {
  const db = fakeDb();
  const ids = await shareRuns(db, [1500, 2400, null, 1900]);
  const [other] = await shareRuns(db, [9999], { stageId: 53 });
  for (const id of [...ids, other]) await setListed(db, "owner", id, true);

  const runs = await listStageRuns(db, 52);
  assert.deepEqual(
    runs.map((r) => r.name),
    ["run 2400", "run 1900", "run 1500", "run null"],
  );
  for (const run of runs) {
    assert.ok(isShareId(run.id));
    for (const field of ["userId", "sourceId", "_id", "listed"]) {
      assert.equal(field in run, false);
    }
  }
  assert.deepEqual(
    (await listStageRuns(db, 53)).map((r) => r.id),
    [other],
  );
});

test("a stage's listing is capped", async () => {
  const db = fakeDb();
  const means = Array.from({ length: 60 }, (_, i) => 1000 + i);
  for (const id of await shareRuns(db, means)) {
    await setListed(db, "owner", id, true);
  }
  assert.equal((await listStageRuns(db, 52)).length, STAGE_RUNS_LIMIT);
  assert.equal((await listStageRuns(db, 52, 5))[0].name, "run 1059");
  assert.equal((await listStageRuns(db, 52, 1000)).length, 50);
});

test("custom and malformed stages have no listing", async () => {
  const db = fakeDb();
  for (const bad of ["custom", "52", 0, -1, 1.5, null, { $ne: null }]) {
    assert.equal(isListableStageId(bad), false);
    assert.deepEqual(await listStageRuns(db, bad), []);
  }
  assert.equal(isListableStageId(52), true);
});

test("the owner's list says which shared runs are listed", async () => {
  const db = fakeDb();
  const [id] = await shareRuns(db, [2000]);
  await setListed(db, "owner", id, true);
  assert.equal((await listSharedRuns(db, "owner"))[0].listed, true);
});
