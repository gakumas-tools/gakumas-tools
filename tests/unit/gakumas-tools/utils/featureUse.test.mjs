import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_EVENTS,
  featureUseWrite,
  isoWeek,
} from "../../../../gakumas-tools/utils/featureUse.js";

test("ISO weeks, at the year's edges too", () => {
  assert.equal(isoWeek(new Date("2026-11-28T05:00:00Z")), "2026-W48");
  assert.equal(isoWeek(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")), "2026-W53");
  assert.equal(isoWeek(new Date("2024-12-30T00:00:00Z")), "2025-W01");
});

test("an event counts once in its week's document", () => {
  const write = featureUseWrite(
    "rehearsalShared",
    new Date("2026-11-28T05:00:00Z"),
  );
  assert.deepEqual(write, {
    filter: { _id: "2026-W48:rehearsalShared" },
    update: {
      $inc: { n: 1 },
      $setOnInsert: { week: "2026-W48", event: "rehearsalShared" },
    },
  });
});

test("only the known steps are counted", () => {
  assert.equal(featureUseWrite("anything", new Date()), null);
  assert.equal(featureUseWrite(undefined, new Date()), null);
  assert.equal(FEATURE_EVENTS.length, new Set(FEATURE_EVENTS).size);
});
