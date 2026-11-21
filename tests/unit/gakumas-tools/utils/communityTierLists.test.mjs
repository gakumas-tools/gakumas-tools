import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNITY_MAX_LISTS,
  COMMUNITY_MIN_LISTS,
  COMMUNITY_TIER_LISTS,
  communityTierList,
  getPublishedTierList,
  minListsFor,
  normalizeTierList,
  publishTierList,
  unpublishTierList,
} from "../../../../gakumas-tools/utils/communityTierLists.js";

// Just enough of a MongoDB collection for these queries: equality filters,
// $set with upsert, deleteOne, a projection that drops _id, sort on one
// date field and limit.
function fakeDb() {
  const collections = {};
  const matches = (doc, filter) =>
    Object.entries(filter).every(([key, value]) => doc[key] === value);
  const collection = (name) =>
    (collections[name] ??= {
      docs: [],
      async findOne(filter) {
        return this.docs.find((doc) => matches(doc, filter)) ?? null;
      },
      async updateOne(filter, update, options = {}) {
        const doc = this.docs.find((d) => matches(d, filter));
        if (doc) {
          Object.assign(doc, update.$set);
          return { matchedCount: 1 };
        }
        if (options.upsert) this.docs.push({ ...filter, ...update.$set });
        return { matchedCount: 0 };
      },
      async deleteOne(filter) {
        const i = this.docs.findIndex((doc) => matches(doc, filter));
        if (i < 0) return { deletedCount: 0 };
        this.docs.splice(i, 1);
        return { deletedCount: 1 };
      },
      find(filter, { projection } = {}) {
        let found = this.docs.filter((doc) => matches(doc, filter));
        const cursor = {
          sort(spec) {
            const [[key, dir]] = Object.entries(spec);
            found = [...found].sort((a, b) => (a[key] - b[key]) * dir);
            return cursor;
          },
          limit(n) {
            found = found.slice(0, n);
            return cursor;
          },
          toArray: async () =>
            found.map((doc) => {
              if (!projection) return doc;
              const out = {};
              for (const [k, on] of Object.entries(projection)) {
                if (on && k in doc) out[k] = doc[k];
              }
              return out;
            }),
        };
        return cursor;
      },
    });
  return { collection, collections };
}

test("normalizes a list: empty tiers dropped, bad ids and unknown ranks out", () => {
  assert.equal(normalizeTierList("SS=1.2_S=_A=3.0.-4_Z=9"), "SS=1.2_A=3");
  assert.equal(
    normalizeTierList("SS=1.2_A=3", (id) => id != 2),
    "SS=1_A=3",
  );
});

test("refuses lists that rank nothing, can't be read, or are too long", () => {
  assert.equal(normalizeTierList("S=_A="), null);
  assert.equal(normalizeTierList(""), null);
  assert.equal(normalizeTierList(null), null);
  assert.equal(normalizeTierList({ tiers: [] }), null);
  assert.equal(normalizeTierList("S=" + "1.".repeat(20_000)), null);
  const ids = Array.from({ length: 2001 }, (_, i) => i + 1).join(".");
  assert.equal(normalizeTierList(`S=${ids}`), null);
});

test("publishing keeps one list per player and type, replacing the last", async () => {
  const db = fakeDb();
  assert.deepEqual(await publishTierList(db, "u1", "P_ITEM", "S=1_A=2"), {
    list: "S=1_A=2",
  });
  assert.deepEqual(await publishTierList(db, "u1", "P_ITEM", "SS=2_B=1"), {
    list: "SS=2_B=1",
  });
  await publishTierList(db, "u1", "SKILL_CARD", "S=5");
  const docs = db.collections[COMMUNITY_TIER_LISTS].docs;
  assert.equal(docs.length, 2);
  assert.equal(await getPublishedTierList(db, "u1", "P_ITEM"), "SS=2_B=1");
  assert.equal(await getPublishedTierList(db, "u2", "P_ITEM"), null);
});

test("publishing refuses no user, an unknown type, or a list ranking nothing", async () => {
  const db = fakeDb();
  assert.equal((await publishTierList(db, null, "P_ITEM", "S=1")).status, 401);
  assert.equal((await publishTierList(db, "u1", "CARD", "S=1")).status, 400);
  assert.equal((await publishTierList(db, "u1", "P_ITEM", "S=")).status, 400);
  assert.equal(db.collections[COMMUNITY_TIER_LISTS]?.docs.length ?? 0, 0);
});

test("unpublishing takes out only that player's list for that type", async () => {
  const db = fakeDb();
  await publishTierList(db, "u1", "P_ITEM", "S=1");
  await publishTierList(db, "u2", "P_ITEM", "S=1");
  assert.equal(await unpublishTierList(db, "u1", "P_ITEM"), true);
  assert.equal(await unpublishTierList(db, "u1", "P_ITEM"), false);
  assert.equal(await getPublishedTierList(db, "u2", "P_ITEM"), "S=1");
});

test("the community view waits for enough lists, then shows no owners", async () => {
  const db = fakeDb();
  for (let i = 1; i < COMMUNITY_MIN_LISTS; i++) {
    await publishTierList(db, `u${i}`, "P_ITEM", "S=1");
  }
  assert.deepEqual(await communityTierList(db, "P_ITEM"), {
    lists: COMMUNITY_MIN_LISTS - 1,
    list: null,
    byId: null,
    minLists: null,
  });
  await publishTierList(db, "u9", "P_ITEM", "A=1.2");
  const view = await communityTierList(db, "P_ITEM");
  assert.equal(view.lists, COMMUNITY_MIN_LISTS);
  assert.deepEqual(view.list, { tiers: ["S", "A"], items: { S: [1], A: [2] } });
  assert.deepEqual(view.byId[1].counts, { S: 2, A: 1 });
  assert.ok(!JSON.stringify(view).includes("u9"));
  assert.equal(await communityTierList(db, "BAD"), null);
});

test("past 10 lists, an id needs a tenth of them to be shown", async () => {
  assert.equal(minListsFor(9), 1);
  assert.equal(minListsFor(10), 1);
  assert.equal(minListsFor(25), 3);
  const db = fakeDb();
  for (let i = 0; i < 20; i++) {
    await publishTierList(db, `u${i}`, "P_DRINK", i == 0 ? "S=1.2" : "S=1");
  }
  const view = await communityTierList(db, "P_DRINK");
  assert.equal(view.minLists, 2);
  assert.deepEqual(Object.keys(view.byId), ["1"]);
});

test("counts only the newest lists", async () => {
  const db = fakeDb();
  const docs = db.collection(COMMUNITY_TIER_LISTS).docs;
  for (let i = 0; i < COMMUNITY_MAX_LISTS + 5; i++) {
    docs.push({
      userId: `u${i}`,
      type: "P_IDOL",
      list: i < 5 ? "B=7" : "S=7",
      updatedAt: new Date(1000 + i),
    });
  }
  const view = await communityTierList(db, "P_IDOL");
  assert.equal(view.lists, COMMUNITY_MAX_LISTS);
  assert.deepEqual(view.byId[7].counts, { S: COMMUNITY_MAX_LISTS });
});
