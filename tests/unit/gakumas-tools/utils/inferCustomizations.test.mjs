import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customizationCandidates,
  inferCustomizations,
  predictBadges,
} from "../../../../gakumas-tools/utils/inferCustomizations.js";

const SEISHIN_TOUITSU = 752;
const SONZAIKAN = 117;
const KYAKKOU = 762;
const KIMAGURE_HEART = 713;
const OKKINA_ONIGIRI = 273;
const WAKUWAKU = 129;
const HACHIKU = 597;
const HABATAKE = 780;
const SEKAIICHI = 619;

test("predicts the badges of an uncustomized card", () => {
  assert.deepEqual(predictBadges(SEISHIN_TOUITSU), {
    dot: 0,
    score: null,
    genki: 8,
    cost: 3,
    icon: "concentration",
  });
});

test("adds appended score and genki growth to the badges", () => {
  assert.deepEqual(predictBadges(SEISHIN_TOUITSU, { 3: 1, 59: 1 }), {
    dot: 2,
    score: 6,
    genki: 12,
    cost: 3,
    icon: "concentration",
  });
});

test("puts an added effect's icon at the bottom", () => {
  assert.equal(predictBadges(HACHIKU).icon, "lasting");
  assert.equal(predictBadges(HACHIKU, { 14: 1 }).icon, "goodCondition");
});

test("shows card effects after actions, and no icon for resets", () => {
  assert.equal(predictBadges(HABATAKE).icon, "growth");
  assert.equal(predictBadges(SEKAIICHI).icon, "scaling");
});

test("breaks ties with the closest candidate icon", () => {
  const badges = {
    dot: 2,
    score: null,
    genki: null,
    cost: 2,
    icon: { perfectCondition: 0.05, goodCondition: 0.1, lasting: 0.4 },
  };
  for (const c11n of customizationCandidates(HACHIKU, badges)) {
    assert.equal(c11n[14], 1);
  }
});

test("sums appended genki into the shown genki", () => {
  assert.equal(predictBadges(KIMAGURE_HEART, { 27: 1 }).genki, 7);
});

test("shows the constant part of a scaling gain", () => {
  assert.equal(predictBadges(OKKINA_ONIGIRI).genki, 2);
});

test("reduces typed costs", () => {
  assert.equal(predictBadges(SONZAIKAN, { 31: 1 }).cost, 0);
});

test("picks the only combination matching the shown badges", () => {
  const badges = { dot: 2, score: 6, genki: 8, cost: 3 };
  assert.deepEqual(inferCustomizations(SEISHIN_TOUITSU, badges), {
    3: 1,
    54: 1,
  });
});

test("ignores badges that couldn't be read", () => {
  const unread = { dot: 1, score: null, genki: null, cost: undefined };
  assert.equal(customizationCandidates(KYAKKOU, unread).length, 2);
  assert.deepEqual(inferCustomizations(KYAKKOU, { ...unread, cost: 2 }), {
    17: 1,
  });
});

test("keeps every combination the badges can't tell apart", () => {
  const badges = { dot: 2, score: null, genki: null, cost: 3 };
  assert.deepEqual(customizationCandidates(WAKUWAKU, badges), [
    { 36: 1, 56: 1 },
    { 56: 2 },
  ]);
});

test("drops a contradicting badge before giving up", () => {
  const badges = { dot: 1, score: 99, genki: null, cost: 0 };
  assert.deepEqual(inferCustomizations(SONZAIKAN, badges), { 31: 1 });
});

test("returns no customizations without a dot", () => {
  assert.deepEqual(inferCustomizations(SEISHIN_TOUITSU, { dot: 0 }), {});
});
