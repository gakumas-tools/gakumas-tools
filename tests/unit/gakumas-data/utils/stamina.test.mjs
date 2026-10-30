import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIdols,
  calculateMemoryStamina,
  getAvailableTrueEndScenarios,
  getMemoryStaminaBreakdown,
  getSenseiStaminaBonus,
} from "gakumas-data";

test("Sensei stamina follows the support-card level breakpoints", () => {
  assert.equal(getSenseiStaminaBonus(0), 0);
  assert.equal(getSenseiStaminaBonus(1), 4);
  assert.equal(getSenseiStaminaBonus(24), 4);
  assert.equal(getSenseiStaminaBonus(25), 5);
  assert.equal(getSenseiStaminaBonus(50), 8);
  assert.equal(getSenseiStaminaBonus(60), 9);
});

test("Hiro real-data vector totals 47 stamina", () => {
  const pIdol = PIdols.getById(26); // 光景 篠澤 広
  assert.deepEqual(
    getMemoryStaminaBreakdown({
      pIdol,
      trainingRank: 5,
      awakeningRank: 0,
      affectionLevel: 20,
      trueEndScenarios: ["hajime"],
      senseiLevels: [50, 60],
    }),
    {
      base: 22,
      training: 6,
      awakening: 0,
      affection: 0,
      trueEnd: 2,
      sensei: 17,
      total: 47,
    }
  );
});

test("earned True End achievements and progression bonuses total 46", () => {
  const pIdol = PIdols.getById(24); // Wonder Scale 倉本 千奈
  assert.deepEqual(
    getMemoryStaminaBreakdown({
      pIdol,
      trainingRank: 7,
      awakeningRank: 4,
      affectionLevel: 27,
      trueEndScenarios: ["hajime", "nia"],
      senseiLevels: [60],
    }),
    {
      base: 23,
      training: 6,
      awakening: 3,
      affection: 2,
      trueEnd: 3,
      sensei: 9,
      total: 46,
    }
  );
});

test("P-idol-specific stamina overrides stay isolated in calculator data", () => {
  assert.equal(
    calculateMemoryStamina({ pIdol: PIdols.getById(62) }),
    31
  );
  assert.equal(
    calculateMemoryStamina({
      pIdol: PIdols.getById(64),
      trainingRank: 7,
    }),
    31
  );
});

test("only confirmed True End scenarios are exposed to the UI", () => {
  assert.deepEqual(getAvailableTrueEndScenarios(PIdols.getById(19)), [
    "hajime",
    "nia",
  ]);
  assert.deepEqual(getAvailableTrueEndScenarios(PIdols.getById(20)), [
    "hajime",
    "nia",
    "hif",
  ]);
});

test("unconfirmed preview metadata stays unavailable", () => {
  const pIdol = PIdols.getById(151); // unreleased Misuzu preview
  assert.equal(calculateMemoryStamina({ pIdol }), null);
});

test("unknown True End scenarios are rejected", () => {
  assert.throws(
    () =>
      calculateMemoryStamina({
        pIdol: PIdols.getById(19),
        trueEndScenarios: ["unknown"],
      }),
    RangeError
  );
});
