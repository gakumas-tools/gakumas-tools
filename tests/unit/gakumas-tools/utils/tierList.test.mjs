import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampList,
  decodeList,
  encodeList,
} from "../../../../gakumas-tools/utils/tierList.js";

test("decodes an encoded list unchanged", () => {
  const list = {
    tiers: ["S4", "SS", "B"],
    items: { S4: [12, 3], SS: [], B: [7] },
  };
  assert.deepEqual(decodeList(encodeList(list)), list);
});

test("keeps each id in the first tier that lists it", () => {
  assert.deepEqual(decodeList("S=1.2_A=2.3.1"), {
    tiers: ["S", "A"],
    items: { S: [1, 2], A: [3] },
  });
  assert.deepEqual(decodeList("S=4.4.5"), {
    tiers: ["S"],
    items: { S: [4, 5] },
  });
});

test("merges a repeated rank into one tier", () => {
  assert.deepEqual(decodeList("S=1_A=3_S=2"), {
    tiers: ["S", "A"],
    items: { S: [1, 2], A: [3] },
  });
});

test("drops unknown ranks and non-numeric ids", () => {
  assert.deepEqual(decodeList("X=1_S=2.x_constructor=3"), {
    tiers: ["S"],
    items: { S: [2] },
  });
  assert.equal(decodeList("X=1_Y"), null);
});

test("a rank repeated in the list is kept once", () => {
  const list = clampList(decodeList(Array(1000).fill("S=1.2").join("_")), 16);
  assert.deepEqual(list.tiers, ["S"]);
  assert.deepEqual(list.items, { S: [1, 2] });
});
