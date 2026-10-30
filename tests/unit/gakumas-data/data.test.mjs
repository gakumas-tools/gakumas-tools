import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Customizations,
  PDrinks,
  PItems,
  SkillCards,
  Stages,
  deserializeEffectSequence,
} from "gakumas-data";

const isParsed = (record, fields) =>
  fields.every((field) => Array.isArray(record[field]));

test("getById parses the record it returns", () => {
  const card = SkillCards.getById(1);
  assert.deepEqual(card.cost, deserializeEffectSequence("cost-=4"));
  assert.ok(isParsed(card, ["conditions", "cost", "actions", "effects"]));
  assert.ok(isParsed(PItems.getById(1), ["effects"]));
  assert.ok(
    isParsed(Customizations.getById(21), [
      "conditions",
      "cost",
      "actions",
      "effects",
    ]),
  );
});

test("getFiltered parses every match", () => {
  const cards = SkillCards.getFiltered({ rarities: ["SSR"] });
  assert.ok(cards.length);
  assert.ok(
    cards.every((c) =>
      isParsed(c, ["conditions", "cost", "actions", "effects"]),
    ),
  );
  assert.ok(PItems.getFiltered({}).every((p) => isParsed(p, ["effects"])));
  assert.ok(PDrinks.getFiltered({}).every((d) => isParsed(d, ["actions"])));
});

test("Stages.findLast parses the stage it finds", () => {
  const stage = Stages.findLast((s) => s.type == "contest" && !s.preview);
  assert.equal(stage.type, "contest");
  assert.ok(isParsed(stage, ["effects"]));
});

test("getAll parses every record", () => {
  assert.ok(Stages.getAll().every((s) => isParsed(s, ["effects"])));
  assert.ok(SkillCards.getAll().every((c) => isParsed(c, ["effects"])));
});
