import { test } from "node:test";
import assert from "node:assert/strict";
import { Customizations, SkillCards } from "gakumas-data";
import { calculateContestPower } from "../../../../gakumas-tools/utils/contestPower.js";
import {
  customizationsAfterPick,
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

test("a slot given a different card drops the old card's customizations", () => {
  const other = SkillCards.getAll().find(
    (card) => card.id != CARD && !card.availableCustomizations.includes(65),
  ).id;
  const before = [{}, { 65: MAX }, {}];
  const after = customizationsAfterPick(before, 1, CARD, other);
  assert.deepEqual(after, [{}, {}, {}]);
  assert.deepEqual(before, [{}, { 65: MAX }, {}]);
  assert.deepEqual(customizationsAfterPick(before, 1, CARD, 0), [{}, {}, {}]);

  // The memory's contest power no longer counts them.
  const params = [0, 0, 0, 0];
  const cards = [0, other, 0];
  assert.equal(
    calculateContestPower(params, [], cards, after),
    calculateContestPower(params, [], cards, [{}, {}, {}]),
  );
});

test("picking the same card again keeps its customizations", () => {
  const before = [{}, { 65: MAX }, {}];
  assert.equal(customizationsAfterPick(before, 1, CARD, CARD), before);
});

test("a saved memory loads with only its cards' own customizations", () => {
  const other = SkillCards.getAll().find(
    (card) => card.id != CARD && !card.availableCustomizations.includes(65),
  ).id;
  const memory = {
    skillCardIds: [CARD, other, 0, 0, 0, 0],
    customizations: [{ 65: 1 }, { 65: MAX }],
  };
  const loaded = fixCustomizationGroups(
    [memory.skillCardIds],
    [memory.customizations],
  )[0];
  assert.deepEqual(loaded, [{ 65: 1 }, {}, {}, {}, {}, {}]);
  assert.equal(
    calculateContestPower([0, 0, 0, 0], [], memory.skillCardIds, loaded) -
      calculateContestPower([0, 0, 0, 0], [], memory.skillCardIds, []),
    36,
  );
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
