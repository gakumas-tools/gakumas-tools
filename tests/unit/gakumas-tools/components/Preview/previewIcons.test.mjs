import { test } from "node:test";
import assert from "node:assert/strict";
import { PItems, SkillCards } from "gakumas-data";
import { IdolConfig } from "gakumas-engine";
import {
  boundPreviewLoadout,
  collectIcons,
} from "../../../../../gakumas-tools/components/Preview/previewIcons.js";
import { loadoutFromSearchParams } from "../../../../../gakumas-tools/utils/simulator.js";

const lookups = {
  itemIcon: (item) => `https://cdn.test/items/${item.id}.png`,
  cardIcon: (card) => `https://cdn.test/cards/${card.id}.png`,
};

test("collects icons only for the items, groups and cards the preview draws", () => {
  const pItemIds = PItems.getAll()
    .slice(0, 10)
    .map((item) => item.id);
  const ids = SkillCards.getAll()
    .slice(0, 400)
    .map((card) => card.id);
  const skillCardIdGroups = Array.from({ length: 50 }, (_, g) =>
    ids.slice(g * 8, g * 8 + 8),
  );
  const icons = collectIcons(
    { pItemIds, skillCardIdGroups },
    "https://origin.test",
    lookups,
  );
  const expected = [
    ...pItemIds.slice(0, 4).map((id) => `https://cdn.test/items/${id}.png`),
    ...skillCardIdGroups
      .slice(0, 4)
      .flatMap((group) => group.slice(0, 6))
      .map((id) => `https://cdn.test/cards/${id}.png`),
  ];
  assert.deepEqual([...icons.keys()], expected);
});

test("resolves bundled icons against the request origin", () => {
  const [card] = SkillCards.getAll();
  const icons = collectIcons(
    { pItemIds: [], skillCardIdGroups: [[card.id]] },
    "https://origin.test",
    { ...lookups, cardIcon: () => ({ src: "/_next/static/media/a.png" }) },
  );
  assert.deepEqual(
    [...icons],
    [
      [
        "/_next/static/media/a.png",
        "https://origin.test/_next/static/media/a.png",
      ],
    ],
  );
});

test("a preview loadout keeps the slots it draws, with unknown ids emptied", () => {
  const cards = Array(100).fill("999999-1-2-3-4-5-6-7").join("_");
  const loadout = boundPreviewLoadout(
    loadoutFromSearchParams(
      new URLSearchParams({ items: "999999-1-2-3-4", cards }),
    ),
  );
  assert.deepEqual(loadout.pItemIds, [0, 1, 2, 3]);
  assert.equal(loadout.skillCardIdGroups.length, 4);
  assert.deepEqual(loadout.skillCardIdGroups[0], [0, 1, 2, 3, 4, 5]);
  assert.equal(loadout.customizationGroups[0].length, 6);
  assert.doesNotThrow(() => new IdolConfig(loadout));
});
