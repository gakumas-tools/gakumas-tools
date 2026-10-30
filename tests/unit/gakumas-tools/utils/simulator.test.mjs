import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import { FALLBACK_STAGE } from "../../../../gakumas-tools/simulator/constants.js";
import {
  getSimulatorUrl,
  getStage,
  knownStageId,
  loadoutFromSearchParams,
  loadoutToSearchParams,
} from "../../../../gakumas-tools/utils/simulator.js";

const UNKNOWN_ID = 999999;
const knownStage = Stages.getAll()[0];
const customStage = { ...FALLBACK_STAGE, name: "Mine" };

const loadout = loadoutFromSearchParams(new URLSearchParams());

const roundTrip = (supportBonus) =>
  loadoutFromSearchParams(
    new URLSearchParams(
      loadoutToSearchParams({ ...loadout, supportBonus }).toString(),
    ),
  ).supportBonus;

test("getStage resolves known, custom and missing stages", () => {
  assert.equal(getStage(knownStage.id), knownStage);
  assert.equal(getStage("custom", customStage), customStage);
  assert.equal(getStage(null), FALLBACK_STAGE);
});

test("getStage falls back for an unknown stage id", () => {
  assert.equal(getStage(UNKNOWN_ID), FALLBACK_STAGE);
});

test("knownStageId drops unknown ids", () => {
  assert.equal(knownStageId(knownStage.id), knownStage.id);
  assert.equal(knownStageId("custom"), "custom");
  assert.equal(knownStageId(UNKNOWN_ID), null);
  assert.equal(knownStageId(undefined), null);
});

test("loadoutFromSearchParams drops an unknown stage id", () => {
  const loadout = loadoutFromSearchParams(
    new URLSearchParams(`stage=${UNKNOWN_ID}`)
  );
  assert.equal(loadout.stageId, null);
  assert.ok(loadout.hasDataFromParams);
});

test("getSimulatorUrl has no URL for a stage it can't resolve", () => {
  assert.equal(getSimulatorUrl({ ...loadout, stageId: UNKNOWN_ID }, []), null);
  assert.match(getSimulatorUrl(loadout, [loadout]), /stage=/);
});

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
