import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadoutFromSearchParams,
  loadoutToSearchParams,
} from "../gakumas-tools/utils/simulator.js";

const loadout = loadoutFromSearchParams(new URLSearchParams());

const roundTrip = (supportBonus) =>
  loadoutFromSearchParams(
    new URLSearchParams(
      loadoutToSearchParams({ ...loadout, supportBonus }).toString(),
    ),
  ).supportBonus;

test("support bonus survives a URL round trip", () => {
  for (const supportBonus of [0, 0.1, 0.25]) {
    assert.equal(roundTrip(supportBonus), supportBonus);
  }
});

test("a missing support bonus loads as the default", () => {
  assert.equal(loadout.supportBonus, 0.1);
  assert.equal(roundTrip(null), 0.1);
});

test("an unreadable support bonus loads as none", () => {
  for (const value of ["abc", ""]) {
    const params = new URLSearchParams({ support_bonus: value });
    assert.equal(loadoutFromSearchParams(params).supportBonus, null);
  }
});
