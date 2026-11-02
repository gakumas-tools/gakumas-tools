import { test } from "node:test";
import assert from "node:assert/strict";
import { IdolConfig } from "gakumas-engine";

function makeLoadout(customizations) {
  return {
    params: [100, 200, 300, 50],
    supportBonus: 0,
    pItemIds: [],
    skillCardIdGroups: [[1]],
    customizationGroups: [[customizations]],
  };
}

test("Unknown and zero customizations are dropped without changing the loadout", () => {
  const customizations = Object.freeze({ 21: 1, 22: 0, 999999: 1 });
  const config = new IdolConfig(makeLoadout(customizations));
  assert.deepEqual(config.cards[0].customizations, { 21: 1 });
  assert.deepEqual(customizations, { 21: 1, 22: 0, 999999: 1 });
});

test("Two configs of the same loadout don't share customizations", () => {
  const loadout = makeLoadout({ 21: 1 });
  const first = new IdolConfig(loadout);
  const second = new IdolConfig(loadout);
  first.cards[0].customizations[21] = 2;
  assert.equal(second.cards[0].customizations[21], 1);
});
