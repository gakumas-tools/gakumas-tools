import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveRunMeta,
  extractLoadoutFields,
  formatRelative,
  normalizeSavedRun,
  sameRunInputs,
  stageLabelOf,
} from "../../../../gakumas-tools/utils/simulationRun.js";

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

test("link runs that differ only in a later phase are different runs", () => {
  const first = {
    loadout: { stageId: 121, params: [100, 200, 300, 50] },
    linkLoadouts: [{ stageId: 121, params: [100, 200, 300, 40] }],
  };
  const second = structuredClone(first);
  assert.equal(sameRunInputs(first, second), true);
  second.linkLoadouts[0].params[3] = 60;
  assert.equal(sameRunInputs(first, second), false);
});

test("history keeps percentage input and tells it apart from raw stats", () => {
  const raw = { stageId: 1, params: [100, 200, 300, 50], enterPercents: false };
  const percents = extractLoadoutFields({ ...raw, enterPercents: true });
  assert.equal(percents.enterPercents, true);
  assert.equal(
    normalizeSavedRun({ ...percents, _id: "saved" }).loadout.enterPercents,
    true,
  );
  assert.equal(sameRunInputs({ loadout: raw }, { loadout: percents }), false);
});

test("run metadata doesn't make the same inputs a different run", () => {
  const loadout = { stageId: 1, params: [100, 200, 300, 50] };
  assert.equal(
    sameRunInputs(
      { id: "one", loadout, createdAt: "yesterday" },
      { id: "two", loadout, linkLoadouts: null, stats: { mean: 100 } },
    ),
    true,
  );
});
