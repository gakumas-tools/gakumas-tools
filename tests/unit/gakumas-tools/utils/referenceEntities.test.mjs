import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  PDrinks,
  PItems,
  SkillCards,
} from "gakumas-data";
import {
  getReferenceEntity,
  referencePath,
  referencePaths,
} from "../../../../gakumas-tools/utils/referenceEntities.js";

// Hides a released card and item for one test, so the test doesn't depend on
// which previews are hidden at the time.
function hideSamples(t) {
  for (const [ids, id] of [
    [HIDDEN_CARD_IDS, 915],
    [HIDDEN_ITEM_IDS, 506],
  ]) {
    if (ids.has(id)) continue;
    ids.add(id);
    t.after(() => ids.delete(id));
  }
}

test("every visible card, item and drink has one page", (t) => {
  hideSamples(t);
  const paths = referencePaths();
  const visible =
    SkillCards.getAll().filter((card) => !HIDDEN_CARD_IDS.has(card.id))
      .length +
    PItems.getAll().filter((item) => !HIDDEN_ITEM_IDS.has(item.id)).length +
    PDrinks.getAll().length;
  assert.equal(paths.length, visible);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    const [, , , slug, id] = path.split("/");
    assert.ok(getReferenceEntity(slug, id), path);
  }
});

test("hidden, unknown and non-canonical ids have no page", (t) => {
  hideSamples(t);
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
