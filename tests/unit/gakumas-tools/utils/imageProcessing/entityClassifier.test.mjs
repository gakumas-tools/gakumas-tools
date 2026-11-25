import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COVERED_ENTITY_ID,
  decodeEntityIds,
  firstPItemFilter,
  samePlanFilter,
  slotFilters,
} from "../../../../../gakumas-tools/utils/imageProcessing/entityClassifier.js";

const CLASSES = ["1", "246", "313_12"];

test("each crop decodes to the best class its filter allows", () => {
  const logits = [0.9, 0.5, 0.1, 0.2, 0.3, 0.8];
  assert.deepEqual(decodeEntityIds(logits, CLASSES), [1, 313]);
  assert.deepEqual(
    decodeEntityIds(logits, CLASSES, (id, i) => i == 1 || id != 1),
    [246, 313],
  );
});

test("the covered class is a read only for readers that keep it", () => {
  const classes = ["-1", "0", "246"];
  const logits = [0.9, 0.1, 0.5, 0.2, 0.1, 0.8];
  assert.deepEqual(decodeEntityIds(logits, classes), [246, 246]);
  assert.deepEqual(
    decodeEntityIds(logits, classes, undefined, true),
    [COVERED_ENTITY_ID, 246],
  );
});

// tests/fixtures/contest_loadout/29.webp's main deck (咲季's unique card
// あの日、この場所で+, P-idol 86), with 朝が満たすまで+ (P-idol 104) in place
// of its last card so that two P-idols' unique cards show.
test("the first P-item reads as an item of a P-idol in the main deck", () => {
  const allowed = firstPItemFilter([527, 421, 519, 780, 444, 581]);
  assert.ok(allowed(247, 0));
  assert.ok(allowed(313, 0));
  assert.ok(!allowed(1, 0));
  assert.ok(allowed(1, 1));
});

test("a main deck without a unique card leaves the first P-item open", () => {
  assert.ok(firstPItemFilter([421, 519])(1, 0));
});

// tests/fixtures/contest_loadout/29.webp: an anomaly main deck whose last
// card, 本領発揮+, first read as the sense card 朝が満たすまで+.
test("a memory's cards read in the plan most of them share", () => {
  const rows = [0, 0, 0, 0, 0, 0, 1, 1];
  const allowed = samePlanFilter(rows)([527, 421, 519, 780, 444, 581, 1, 0]);
  assert.ok(!allowed(581, 5));
  assert.ok(allowed(754, 5));
  assert.ok(allowed(1, 5));
  assert.ok(allowed(581, 6));
  assert.ok(allowed(778, 7));
});

test("a memory split evenly between plans stays open", () => {
  const allowed = samePlanFilter([0, 0])([754, 581]);
  assert.ok(allowed(581, 0));
  assert.ok(allowed(778, 1));
});

test("slot filters see slots, not crops, when a slot has no box", () => {
  const seen = [];
  const { allowed, refine } = slotFilters(
    [0, 2],
    3,
    (id, slot) => slot != 2 || id != 1,
    (ids) => {
      seen.push(ids);
      return (id, slot) => slot != 0 || id != 2;
    },
  );
  assert.ok(!allowed(1, 1));
  assert.ok(allowed(1, 0));
  const second = refine([5, 6]);
  assert.deepEqual(seen, [[5, 0, 6]]);
  assert.ok(!second(2, 0));
  assert.ok(second(2, 1));
});
