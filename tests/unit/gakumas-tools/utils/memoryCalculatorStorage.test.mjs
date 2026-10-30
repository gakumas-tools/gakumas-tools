import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEMORY_CALCULATOR_STORAGE_KEY,
  loadMemoryCalculatorState,
  saveMemoryCalculatorState,
} from "../../../../gakumas-tools/utils/memoryCalculatorStorage.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const blockedStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
};

const STATE = {
  targetSkillCardIds: [12, 0],
  alternateSkillCardIds: [[13]],
  targetNegations: [true],
  acquiredSkillCardIds: [0],
  rank: "SS",
};

test("memory calculator state round-trips through storage", () => {
  const storage = createMemoryStorage();
  saveMemoryCalculatorState(STATE, storage);
  assert.deepEqual(loadMemoryCalculatorState(storage), STATE);
});

test("blocked storage loads nothing and saving does not throw", () => {
  assert.deepEqual(loadMemoryCalculatorState(blockedStorage), {});
  assert.doesNotThrow(() => saveMemoryCalculatorState(STATE, blockedStorage));
});

test("corrupt JSON loads nothing", () => {
  for (const raw of ["{", "null", "42", '"abc"']) {
    const storage = createMemoryStorage({ [MEMORY_CALCULATOR_STORAGE_KEY]: raw });
    assert.deepEqual(loadMemoryCalculatorState(storage), {}, raw);
  }
});

test("unknown rank is dropped", () => {
  for (const rank of [5, "X", "toString"]) {
    const storage = createMemoryStorage({
      [MEMORY_CALCULATOR_STORAGE_KEY]: JSON.stringify({ ...STATE, rank }),
    });
    assert.equal(loadMemoryCalculatorState(storage).rank, undefined, String(rank));
  }
});

test("wrong-typed fields are dropped and the rest kept", () => {
  const storage = createMemoryStorage({
    [MEMORY_CALCULATOR_STORAGE_KEY]: JSON.stringify({
      ...STATE,
      targetSkillCardIds: "abc",
      alternateSkillCardIds: { 0: [13] },
      rank: "X",
    }),
  });
  assert.deepEqual(loadMemoryCalculatorState(storage), {
    targetNegations: [true],
    acquiredSkillCardIds: [0],
  });
});
