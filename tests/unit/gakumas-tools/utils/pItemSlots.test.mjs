import { test } from "node:test";
import assert from "node:assert/strict";
import { PItems } from "gakumas-data";
import {
  MAX_PRODUCE_SLOTS,
  fitPItemSlots,
  pickablePItem,
} from "../../../../gakumas-tools/utils/pItemSlots.js";

test("a contest keeps 4 slots", () => {
  assert.deepEqual(fitPItemSlots([], false), [0, 0, 0, 0]);
  assert.deepEqual(fitPItemSlots([1, 2, 3, 4], false), [1, 2, 3, 4]);
  assert.deepEqual(fitPItemSlots([1, 0, 0, 0, 0, 0], false), [1, 0, 0, 0]);
});

test("a contest never drops a filled slot", () => {
  assert.deepEqual(fitPItemSlots([1, 2, 3, 4, 5, 0], false), [1, 2, 3, 4, 5]);
});

test("a produce exam keeps one empty slot after the last filled one", () => {
  assert.deepEqual(fitPItemSlots([0, 0, 0, 0], true), [0, 0, 0, 0]);
  assert.deepEqual(fitPItemSlots([116, 5, 82, 287], true), [116, 5, 82, 287, 0]);
  assert.deepEqual(fitPItemSlots([116, 5, 82, 287, 0, 0, 0], true), [116, 5, 82, 287, 0]);
  assert.deepEqual(fitPItemSlots([116, 0, 82, 0, 0], true), [116, 0, 82, 0]);
});

test("a produce exam grows to its cap and no further", () => {
  const full = Array.from({ length: MAX_PRODUCE_SLOTS }, (_, i) => i + 1);
  assert.deepEqual(fitPItemSlots(full, true), full);
  assert.deepEqual(fitPItemSlots(full.slice(0, -1), true), [...full.slice(0, -1), 0]);
});

test("unchanged slots come back as the same array", () => {
  const ids = [116, 5, 82, 287, 0];
  assert.equal(fitPItemSlots(ids, true), ids);
});

test("produce P-items are pickable only in a produce exam", () => {
  const keyholder = PItems.getById(5);
  assert.equal(keyholder.sourceType, "produce");
  assert.equal(pickablePItem(keyholder, false), false);
  assert.equal(pickablePItem(keyholder, true), true);
  for (const id of [82, 116, 287]) {
    assert.equal(pickablePItem(PItems.getById(id), false), true);
  }
});
