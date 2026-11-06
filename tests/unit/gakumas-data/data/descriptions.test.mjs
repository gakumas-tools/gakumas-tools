import { test } from "node:test";
import assert from "node:assert/strict";
import { Descriptions, PDrinks, PItems, SkillCards } from "gakumas-data";

test("Descriptions has the game's text, a line per effect", () => {
  assert.equal(
    Descriptions.get(SkillCards.getById(530)),
    "パラメータ+2\n元気+2\n消費体力減少3ターン\n次のターン、スキルカードを引く\n重複不可 レッスン中1回",
  );
  assert.ok(Descriptions.get(PItems.getById(414)));
  assert.ok(Descriptions.get(PDrinks.getById(19)));
});

test("Descriptions has none for a panel the capture cut short", () => {
  assert.equal(Descriptions.get(SkillCards.getById(723)), null);
});
