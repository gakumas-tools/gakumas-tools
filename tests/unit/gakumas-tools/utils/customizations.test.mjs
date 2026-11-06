import { test } from "node:test";
import assert from "node:assert/strict";
import { Customizations, SkillCards } from "gakumas-data";
import {
  deserializeCustomizations,
  fixCardCustomizations,
  fixCustomizationGroups,
  serializeCustomizations,
} from "../../../../gakumas-tools/utils/customizations.js";

const CARD = 25;
const MAX = Customizations.getById(65).max;

test("every card keeps its own customizations up to their max level", () => {
  for (const card of SkillCards.getAll()) {
    const maxed = Object.fromEntries(
      card.availableCustomizations.map((id) => [
        id,
        Customizations.getById(id).max,
      ]),
    );
    assert.deepEqual(fixCardCustomizations(card.id, maxed), maxed);
  }
});

test("customizations the card can't have are dropped", () => {
  assert.deepEqual(
    fixCardCustomizations(CARD, { 65: 1, 21: 1, 999999: 1, constructor: 1 }),
    { 65: 1 },
  );
  for (const level of [0, -1, 0.5, MAX + 1, NaN, "1", null]) {
    assert.deepEqual(fixCardCustomizations(CARD, { 65: level }), {});
  }
  assert.deepEqual(fixCardCustomizations(0, { 65: 1 }), {});
  assert.deepEqual(fixCardCustomizations(999999, { 65: 1 }), {});
});

test("fixing makes a new map and leaves the source as it was", () => {
  const source = { 65: 1, 21: 1 };
  const fixed = fixCardCustomizations(CARD, source);
  fixed[65] = 0;
  assert.deepEqual(source, { 65: 1, 21: 1 });
});

test("serializing keeps empty slots in their place", () => {
  const restored = deserializeCustomizations(
    serializeCustomizations([null, { 65: 1 }, undefined]),
  );
  assert.deepEqual(restored, [{}, { 65: 1 }, {}]);
});

test("missing or partial groups become one map per card", () => {
  const cards = [[CARD, 0, 1], [CARD]];
  assert.deepEqual(fixCustomizationGroups(cards, undefined), [
    [{}, {}, {}],
    [{}],
  ]);
  const partial = [[{ 65: 1 }, { 65: 1 }], null];
  assert.deepEqual(fixCustomizationGroups(cards, partial), [
    [{ 65: 1 }, {}, {}],
    [{}],
  ]);
});
