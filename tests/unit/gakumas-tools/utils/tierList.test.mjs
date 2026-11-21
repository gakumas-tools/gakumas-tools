import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampList,
  compareLists,
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

const mine = {
  tiers: ["SSS", "SS", "S", "A"],
  items: { SSS: [1], SS: [2], S: [3, 4], A: [5] },
};
const theirs = {
  tiers: ["S4", "SS", "S", "B"],
  items: { S4: [2], SS: [1], S: [3], B: [5, 6] },
};

test("gives each id its rank in both lists and how far theirs moves it", () => {
  const r = compareLists(mine, theirs);
  assert.deepEqual(r.byId[1], { mine: "SSS", theirs: "SS", delta: -2 });
  assert.deepEqual(r.byId[2], { mine: "SS", theirs: "S4", delta: 4 });
  assert.deepEqual(r.byId[3], { mine: "S", theirs: "S", delta: 0 });
  assert.deepEqual(r.byId[5], { mine: "A", theirs: "B", delta: -2 });
  assert.deepEqual(r.byId[4], { mine: "S", theirs: null, delta: null });
  assert.deepEqual(r.byId[6], { mine: null, theirs: "B", delta: null });
});

test("lists ids found in only one list", () => {
  const r = compareLists(mine, theirs);
  assert.deepEqual(r.onlyMine, [4]);
  assert.deepEqual(r.onlyTheirs, [6]);
});

test("agreement is the share of common ids at the same rank", () => {
  const r = compareLists(mine, theirs);
  assert.equal(r.common, 4);
  assert.equal(r.agreement, 0.25);
  assert.equal(compareLists(mine, mine).agreement, 1);
});

test("agreement is null when nothing is common, and empty input is safe", () => {
  const r = compareLists({ tiers: ["S"], items: { S: [1] } }, null);
  assert.equal(r.agreement, null);
  assert.deepEqual(r.onlyMine, [1]);
  assert.deepEqual(compareLists(null, undefined).byId, {});
});
