import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  PIdols,
  SkillCards,
} from "gakumas-data";
import {
  getEntity,
  searchEntities,
} from "../../../packages/gakumas-tools-mcp/entities.js";

function search(kind, query, plan) {
  return searchEntities({ kind, query, plan, offset: 0, limit: 100 });
}

function foundIds(kind, query, plan) {
  return search(kind, query, plan).entities.map((entity) => entity.id);
}

test("a card is found by its name within its plan", () => {
  assert.ok(foundIds("skillCard", "軽い足取り+", "sense").includes(25));
  assert.equal(search("skillCard", "軽い足取り+", "logic").total, 0);
});

test("fullwidth digits find a card by ID", () => {
  assert.ok(foundIds("skillCard", "２５").includes(25));
});

test("a p-idol is found by its title", () => {
  const pIdol = PIdols.getById(1);
  assert.ok(foundIds("pIdol", pIdol.title).includes(1));
});

test("a card's summary lists its customizations", () => {
  const card = search("skillCard", "25").entities.find(({ id }) => id == 25);
  assert.deepEqual(
    card.availableCustomizations,
    SkillCards.getById(25).availableCustomizations,
  );
});

test("hidden cards and items can't be found or read", (t) => {
  // Hide a released card and item for this test, whatever previews are hidden.
  for (const [ids, id] of [
    [HIDDEN_CARD_IDS, 915],
    [HIDDEN_ITEM_IDS, 506],
  ]) {
    if (ids.has(id)) continue;
    ids.add(id);
    t.after(() => ids.delete(id));
  }
  assert.ok(!foundIds("skillCard", "915").includes(915));
  assert.ok(!foundIds("pItem", "506").includes(506));
  assert.throws(() => getEntity("skillCard", 915));
  assert.throws(() => getEntity("pItem", 506));
});
