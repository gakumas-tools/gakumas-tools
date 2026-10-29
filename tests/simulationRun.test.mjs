import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveRunMeta,
  formatRelative,
  stageLabelOf,
} from "../gakumas-tools/utils/simulationRun.js";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const EXPECTED = {
  en: ["now", "5m ago", "3h ago", "2d ago"],
  ja: ["今", "5分前", "3時間前", "一昨日"],
  "zh-Hans": ["现在", "5分钟前", "3小时前", "前天"],
  ko: ["지금", "5분 전", "3시간 전", "그저께"],
};

for (const [locale, [now, minutes, hours, days]] of Object.entries(EXPECTED)) {
  test(`formatRelative speaks ${locale}`, () => {
    assert.equal(formatRelative(ago(10 * 1000), locale, NOW), now);
    assert.equal(formatRelative(ago(5 * MIN), locale, NOW), minutes);
    assert.equal(formatRelative(ago(3 * HOUR), locale, NOW), hours);
    assert.equal(formatRelative(ago(2 * DAY), locale, NOW), days);
  });
}

test("formatRelative ignores missing or invalid timestamps", () => {
  assert.equal(formatRelative(null, "en", NOW), null);
  assert.equal(formatRelative("not a date", "en", NOW), null);
});

test("custom stages take the caller's label", () => {
  const run = { loadout: { stageId: "custom" } };
  assert.equal(stageLabelOf(run, "カスタム"), "カスタム");
});

test("an unnamed custom stage stores no English name", () => {
  assert.equal(deriveRunMeta({ stageId: "custom" }).stageName, null);
  assert.equal(
    deriveRunMeta({ stageId: "custom", customStage: { name: "Mine" } })
      .stageName,
    "Mine",
  );
});
