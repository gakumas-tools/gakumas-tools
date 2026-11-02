import { test } from "node:test";
import assert from "node:assert/strict";
import { PDrinks, PItems, SkillCards } from "gakumas-data";
import {
  getReferenceEntity,
  referencePath,
  referencePaths,
} from "../../../../gakumas-tools/utils/referenceEntities.js";

test("every visible card, item and drink has one page", () => {
  const paths = referencePaths();
  const visible =
    SkillCards.getAll().filter((card) => ![915, 917, 919, 921].includes(card.id))
      .length +
    PItems.getAll().filter((item) => ![506, 508].includes(item.id)).length +
    PDrinks.getAll().length;
  assert.equal(paths.length, visible);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    const [, , , slug, id] = path.split("/");
    assert.ok(getReferenceEntity(slug, id), path);
  }
});

test("hidden, unknown and non-canonical ids have no page", () => {
  for (const [slug, id] of [
    ["skill-cards", "915"],
    ["p-items", "506"],
    ["skill-cards", "999999"],
    ["skill-cards", "025"],
    ["skill-cards", "25.0"],
    ["constructor", "1"],
    ["p-idols", "1"],
  ]) {
    assert.equal(getReferenceEntity(slug, id), null, `${slug}/${id}`);
  }
  assert.equal(getReferenceEntity("skill-cards", "25"), SkillCards.getById(25));
  assert.equal(referencePath("P_IDOL", 1), null);
});
