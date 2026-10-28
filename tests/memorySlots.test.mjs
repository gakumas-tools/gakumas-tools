import { test } from "node:test";
import assert from "node:assert/strict";
import { setMemorySlot } from "../gakumas-tools/utils/memorySlots.js";

const EMPTY = [null, null];
const A = [1000, 900, 800, 40];
const B = [1500, 1400, 1300, 50];

test("Picking into empty slots starts the params from zero", () => {
  const state = { params: [2700, 2000, 800, 30], slots: EMPTY };
  assert.deepEqual(setMemorySlot(state, 0, B, 1).params, B);
});

test("Replacing a slot removes only what the old memory added", () => {
  let state = { params: [0, 0, 0, 0], slots: EMPTY };
  state = setMemorySlot(state, 0, A, 1);
  state = setMemorySlot(state, 1, A, 0.2);
  state = setMemorySlot(state, 1, B, 0.2);
  assert.deepEqual(state.params, [1300, 1180, 1060, 50]);
});
