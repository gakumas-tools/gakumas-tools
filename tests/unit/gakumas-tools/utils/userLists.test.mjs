import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LOADOUTS_PER_USER,
  MAX_MEMORIES_PER_USER,
} from "../../../../gakumas-tools/utils/apiValidation.js";
import { listLoadouts, listMemories } from "../../../../gakumas-tools/utils/userLists.js";

function fakeDb(docs) {
  const calls = {};
  const cursor = {
    sort(spec) {
      calls.sort = spec;
      return cursor;
    },
    limit(n) {
      calls.limit = n;
      return cursor;
    },
    async toArray() {
      return docs;
    },
  };
  return {
    calls,
    collection(name) {
      calls.collection = name;
      return {
        find(filter, options) {
          calls.filter = filter;
          calls.options = options;
          return cursor;
        },
      };
    },
  };
}

test("listLoadouts scopes to the user, newest first, capped, without userId", async () => {
  const docs = [{ _id: "a" }];
  const db = fakeDb(docs);
  assert.equal(await listLoadouts(db, "u1"), docs);
  assert.deepEqual(db.calls, {
    collection: "loadouts",
    filter: { userId: "u1" },
    options: { projection: { userId: 0 } },
    sort: { createdAt: -1 },
    limit: MAX_LOADOUTS_PER_USER,
  });
});

test("listMemories scopes to the user, capped, without userId", async () => {
  const docs = [{ _id: "m" }];
  const db = fakeDb(docs);
  assert.equal(await listMemories(db, "u1"), docs);
  assert.deepEqual(db.calls, {
    collection: "memories",
    filter: { userId: "u1" },
    options: { projection: { userId: 0 } },
    limit: MAX_MEMORIES_PER_USER,
  });
});
