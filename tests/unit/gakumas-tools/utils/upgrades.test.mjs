import { test } from "node:test";
import assert from "node:assert/strict";
import { PItems, SkillCards } from "gakumas-data";
import { getOtherVersionId } from "../../../../gakumas-tools/utils/upgrades.js";
import { getSearchScore } from "../../../../gakumas-tools/utils/sort.js";

const card = (id) => SkillCards.getById(id);
const item = (id) => PItems.getById(id);

test("base and upgraded versions point at each other", () => {
  assert.equal(getOtherVersionId(SkillCards, card(406)), 407); // 汗と成長
  assert.equal(getOtherVersionId(SkillCards, card(407)), 406); // 汗と成長+
  assert.equal(getOtherVersionId(PItems, item(192)), 193);
  assert.equal(getOtherVersionId(PItems, item(193)), 192);
});

test("entities without an upgraded version have no other version", () => {
  assert.equal(getOtherVersionId(SkillCards, card(720)), null); // 最高傑作 (L)
  assert.equal(getOtherVersionId(PItems, item(406)), null); // あさり先生のおまもり
  assert.equal(getOtherVersionId(SkillCards, undefined), null);
});

test("memory search doesn't count a neighbouring id as the other version", () => {
  const memory = { pItemIds: [407], skillCardIds: [721] };
  assert.equal(getSearchScore(memory, [], [720]), 0);
  assert.equal(getSearchScore(memory, [406], []), 0);
});

test("memory search still gives partial credit for the other version", () => {
  const memory = { pItemIds: [193], skillCardIds: [407] };
  assert.equal(getSearchScore(memory, [], [406]), 0.6);
  assert.equal(getSearchScore(memory, [], [407]), 1);
  assert.equal(getSearchScore(memory, [192], []), 0.6);
});
