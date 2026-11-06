import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializePatchSequence } from "gakumas-data/utils/effects";

test("modifiers written after a patch apply to its effect", () => {
  const [append] = deserializePatchSequence("+ score+=1; limit:1");
  assert.equal(append.op, "append");
  assert.equal(append.effect.limit, 1);

  const [timed] = deserializePatchSequence("+ at:startOfTurn { score+=1 }; ttl:2");
  assert.equal(timed.effect.ttl, 2);

  const [patch] = deserializePatchSequence("@base score+=2; limit:3");
  assert.equal(patch.op, "patch");
  assert.equal(patch.delta.limit, 3);
});

test("level stays on the patch record, not the effect", () => {
  const [append] = deserializePatchSequence("level:2 { + score+=1; limit:1 }");
  assert.equal(append.level, 2);
  assert.equal(append.effect.limit, 1);
  assert.equal(append.effect.level, undefined);
});

test("an append that expands to several effects appends them all", () => {
  const records = deserializePatchSequence(
    "+ at:startOfTurn { if:stamina>=1 { score+=1 } if:genki>=1 { score+=2 } }",
  );
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.op === "append" && r.effect.phase === "startOfTurn"));
});

test("nested conditions in an anchor patch add to the outer ones", () => {
  const [patch] = deserializePatchSequence(
    "@base if:stamina>=1 { if:genki>=1 { score+=1 } }",
  );
  assert.equal(patch.delta.conditions.length, 2);
});
