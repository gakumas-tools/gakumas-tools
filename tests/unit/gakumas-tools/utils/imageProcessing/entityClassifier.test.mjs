import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntityIds,
  firstPItemFilter,
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

// tests/fixtures/contest_loadout/29.webp: 咲季's main deck holds her unique
// card あの日、この場所で+ (P-idol 86) and 朝が満たすまで+ (P-idol 104).
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
