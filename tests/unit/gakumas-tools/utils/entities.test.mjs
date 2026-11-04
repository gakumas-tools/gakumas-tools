import { test } from "node:test";
import assert from "node:assert/strict";
import { SkillCards } from "gakumas-data";
import {
  EntityTypes,
  getBankEntities,
} from "../../../../gakumas-tools/utils/entities.js";

const ids = (entities) => entities.map((entity) => entity.id);

// Owned memory 学園生活 花海咲季 (Sense, Saki): its Stage deck is
// 182, 挑戦 (5), 振る舞いの基本 (15) ×2 (game 3.5.0, 2026-11-04).
test("the filtered skill card bank offers default cards a memory holds", () => {
  const bank = ids(
    getBankEntities(EntityTypes.SKILL_CARD, {
      filter: true,
      plan: "sense",
      idolId: 1,
    }),
  );
  for (const id of [182, 5, 15]) assert.ok(bank.includes(id), `card ${id}`);
});

test("the filtered skill card bank keeps every default card of the plan", () => {
  const bank = new Set(
    ids(
      getBankEntities(EntityTypes.SKILL_CARD, {
        filter: true,
        plan: "logic",
        idolId: 1,
      }),
    ),
  );
  const defaults = SkillCards.getAll().filter(
    (card) =>
      card.sourceType == "default" && ["logic", "free"].includes(card.plan),
  );
  assert.ok(defaults.length > 0);
  for (const card of defaults) assert.ok(bank.has(card.id), card.name);
  for (const card of SkillCards.getAll()) {
    if (card.sourceType == "default" && card.plan == "sense") {
      assert.ok(!bank.has(card.id), card.name);
    }
  }
});

test("the unfiltered bank is every entity", () => {
  assert.equal(
    getBankEntities(EntityTypes.SKILL_CARD, { filter: false }).length,
    SkillCards.getAll().length,
  );
});
