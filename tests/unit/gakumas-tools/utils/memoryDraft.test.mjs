import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEMORY_DRAFT_STORAGE_KEY,
  stashMemoryDraft,
  takeMemoryDraft,
} from "../../../../gakumas-tools/utils/memoryDraft.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const DRAFT = {
  _id: null,
  name: "咲季 SS+",
  pIdolId: 3,
  params: [1200, 1100, 900, null],
  pItemIds: [12, 0, 0, 0],
  skillCardIds: [45, 46, 0, 0, 0, 0],
  customizations: [{ 1: 2 }, {}, {}, {}, {}, {}],
};

test("a stashed draft comes back once", () => {
  const storage = createMemoryStorage();
  stashMemoryDraft(DRAFT, storage);
  assert.deepEqual(takeMemoryDraft(storage), DRAFT);
  assert.equal(takeMemoryDraft(storage), null);
});

test("nothing stashed yields nothing", () => {
  assert.equal(takeMemoryDraft(createMemoryStorage()), null);
});

test("a corrupted draft is discarded", () => {
  const storage = createMemoryStorage({
    [MEMORY_DRAFT_STORAGE_KEY]: "{not json",
  });
  assert.equal(takeMemoryDraft(storage), null);
  assert.equal(storage.getItem(MEMORY_DRAFT_STORAGE_KEY), null);
});

test("a draft that is not an object is discarded", () => {
  const storage = createMemoryStorage({
    [MEMORY_DRAFT_STORAGE_KEY]: JSON.stringify([1, 2, 3]),
  });
  assert.equal(takeMemoryDraft(storage), null);
});

test("unavailable storage neither throws nor restores", () => {
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("SecurityError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert.doesNotThrow(() => stashMemoryDraft(DRAFT, broken));
  assert.equal(takeMemoryDraft(broken), null);
});
