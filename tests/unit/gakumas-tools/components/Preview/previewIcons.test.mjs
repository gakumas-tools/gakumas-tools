import { test } from "node:test";
import assert from "node:assert/strict";
import { PItems, SkillCards } from "gakumas-data";
import { collectIcons } from "../../../../../gakumas-tools/components/Preview/previewIcons.js";

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
