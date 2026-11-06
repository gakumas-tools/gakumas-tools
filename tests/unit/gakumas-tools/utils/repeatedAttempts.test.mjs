import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attemptsForChance,
  chanceWithinAttempts,
} from "../../../../gakumas-tools/utils/repeatedAttempts.js";

test("chance of at least one success over a few coin flips", () => {
  assert.equal(chanceWithinAttempts(0.5, 3), 0.875);
  assert.equal(chanceWithinAttempts(0, 100), 0);
  assert.equal(chanceWithinAttempts(1, 100), 1);
});

test("a tiny probability still adds up over many attempts", () => {
  const chance = chanceWithinAttempts(1e-18, 1_000_000);
  assert.ok(Math.abs(chance - 1e-12) < 1e-24);
});

test("attempts needed is the first count that reaches the chance", () => {
  for (const probability of [0.001, 0.01, 0.1, 0.5, 0.8, 0.999]) {
    for (const chance of [0.5, 0.9, 0.95, 0.99]) {
      const attempts = attemptsForChance(probability, chance);
      assert.ok(chanceWithinAttempts(probability, attempts) >= chance);
      if (attempts > 1) {
        assert.ok(chanceWithinAttempts(probability, attempts - 1) < chance);
      }
    }
  }
  assert.equal(attemptsForChance(0.1, 0.9), 22);
  assert.equal(attemptsForChance(1, 0.99), 1);
});

test("a chance out of reach within a million attempts has no count", () => {
  assert.equal(attemptsForChance(0, 0.5), null);
  assert.equal(attemptsForChance(1e-18, 0.5), null);
});
