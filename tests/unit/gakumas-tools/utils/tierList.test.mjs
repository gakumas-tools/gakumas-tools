import { test } from "node:test";
import assert from "node:assert/strict";
import { clampList, decodeList } from "../../../../gakumas-tools/utils/tierList.js";

test("a rank repeated in the list is kept once", () => {
  const list = clampList(decodeList(Array(1000).fill("S=1.2").join("_")), 16);
  assert.deepEqual(list.tiers, ["S"]);
  assert.deepEqual(list.items, { S: [1, 2] });
});
