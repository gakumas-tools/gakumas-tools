import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  getSharedRun,
  isShareId,
  listSharedRuns,
  newShareId,
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
