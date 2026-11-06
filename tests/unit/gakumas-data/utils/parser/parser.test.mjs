import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializePatchSequence } from "gakumas-data/utils/effects";

test("bare actions before a non-action effect keep their actions", () => {
  assert.deepEqual(
    deserializePatchSequence(
      "score+=5; genki+=3; if:goodConditionTurns>=1 { score+=1 }",
    ),
    [
      ...deserializePatchSequence("score+=5; genki+=3"),
      ...deserializePatchSequence("if:goodConditionTurns>=1 { score+=1 }"),
    ],
  );
  assert.deepEqual(
    deserializePatchSequence("score+=5; at:startOfTurn { genki+=1 }"),
    [
      ...deserializePatchSequence("score+=5"),
      ...deserializePatchSequence("at:startOfTurn { genki+=1 }"),
    ],
  );
});
