import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combineTotal,
  combineTurn,
  runVariantUses,
} from "../../../../../gakumas-tools/components/SimulatorStats/helpers.js";

const score = (id, amount) => ({
  byEntity: {
    [`skillCard:${id}`]: {
      type: "skillCard",
      id,
      score: amount,
      scoreByType: { vocal: amount, dance: 0, visual: 0 },
    },
  },
});

const rows = (byCard) =>
  Object.values(byCard)
    .map(({ id, c, use, score }) => ({ id, c, use, score }))
    .sort((a, b) => JSON.stringify(a.c).localeCompare(JSON.stringify(b.c)));

test("a customized card's delayed-effect score stays on its row", () => {
  const c = { 1: 1 };
  // Turn 1: the customized card is used for 300. Turn 2: it isn't in
  // hand, and its delayed effect scores 700.
  const usage = [{ a: { id: 100, c, use: 1, draw: 1 } }, {}];
  const runUses = runVariantUses(usage);
  const perTurn = [
    { byCard: combineTurn(usage[0], score(100, 300), runUses) },
    { byCard: combineTurn(usage[1], score(100, 700), runUses) },
  ];
  assert.deepEqual(rows(combineTotal(perTurn)), [
    { id: 100, c, use: 1, score: 1000 },
  ]);
});

test("delayed-effect score is split by the variants' uses over the run", () => {
  const c = { 1: 1 };
  const usage = [
    {
      a: { id: 100, c, use: 3, draw: 3 },
      b: { id: 100, c: null, use: 1, draw: 2 },
    },
    {},
  ];
  const runUses = runVariantUses(usage);
  const total = combineTotal([
    { byCard: combineTurn(usage[0], {}, runUses) },
    { byCard: combineTurn(usage[1], score(100, 400), runUses) },
  ]);
  assert.deepEqual(rows(total), [
    { id: 100, c, use: 3, score: 300 },
    { id: 100, c: null, use: 1, score: 100 },
  ]);
});

test("a card that is never used still shows its score", () => {
  const byCard = combineTurn({}, score(100, 50), runVariantUses([{}]));
  assert.deepEqual(rows(byCard), [{ id: 100, c: null, use: 0, score: 50 }]);
});
