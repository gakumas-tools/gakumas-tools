import { test } from "node:test";
import assert from "node:assert/strict";
import { synchronizeLinkLoadouts } from "../../../../gakumas-tools/utils/linkLoadouts.js";

function makeLoadout(n) {
  return {
    stageId: 121,
    enterPercents: false,
    customStage: {},
    supportBonus: n / 100,
    params: [100 * n, 200 * n, 300 * n, 40 + n],
    pItemIds: [n],
    skillCardIdGroups: [[n]],
    customizationGroups: [[{}]],
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("New phases get their own copy of the loadout", () => {
  const loadout = deepFreeze(makeLoadout(1));
  const phases = synchronizeLinkLoadouts([loadout], loadout, 0, 3);
  assert.equal(phases.length, 3);
  assert.deepEqual(phases[1], loadout);
  assert.notEqual(phases[1], phases[2]);
  assert.notEqual(phases[1].params, phases[2].params);
});

test("Vo/Da/Vi are shared, while each phase keeps its own stamina and deck", () => {
  const phases = deepFreeze([makeLoadout(1), makeLoadout(2), makeLoadout(3)]);
  const edited = deepFreeze({ ...makeLoadout(4), params: [1100, 2200, 3300, 54] });
  const synced = synchronizeLinkLoadouts(phases, edited, 1, 3);
  assert.deepEqual(synced[0].params, [1100, 2200, 3300, 41]);
  assert.deepEqual(synced[1].params, [1100, 2200, 3300, 54]);
  assert.deepEqual(synced[2].params, [1100, 2200, 3300, 43]);
  assert.deepEqual(synced[2].skillCardIdGroups, [[3]]);
  assert.equal(synced[2].supportBonus, 0.03);
});

test("A custom stage reaches every phase and stays after switching phase", () => {
  const phases = deepFreeze([makeLoadout(1), makeLoadout(2), makeLoadout(3)]);
  const customStage = { type: "linkContest", linkTurnCounts: [2, 5, 5] };
  const edited = deepFreeze({ ...makeLoadout(1), stageId: "custom", customStage });
  const synced = synchronizeLinkLoadouts(phases, edited, 0, 3);
  const switched = synchronizeLinkLoadouts(synced, synced[2], 2, 3);
  assert.ok(switched.every((phase) => phase.customStage === customStage));
});

test("Percentage input is shared by every phase", () => {
  const phases = [makeLoadout(1), makeLoadout(2), makeLoadout(3)];
  const edited = { ...makeLoadout(1), enterPercents: true };
  const synced = synchronizeLinkLoadouts(phases, edited, 0, 3);
  assert.ok(synced.every((phase) => phase.enterPercents));
});

test("Fewer phases drops the extra ones and keeps the edited loadout", () => {
  const phases = deepFreeze([makeLoadout(1), makeLoadout(2), makeLoadout(3)]);
  const edited = deepFreeze(makeLoadout(4));
  const synced = synchronizeLinkLoadouts(phases, edited, 2, 2);
  assert.deepEqual(synced.map((phase) => phase.pItemIds), [[1], [4]]);
});
