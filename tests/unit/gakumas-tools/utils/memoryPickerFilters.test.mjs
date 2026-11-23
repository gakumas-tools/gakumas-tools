import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PIdols, SkillCards } from "gakumas-data";
import {
  ACQUIRED_FILTER,
  DRAFT_FILTER,
  TARGET_FILTER,
} from "../../../../gakumas-tools/utils/memoryPickerFilters.js";

// Captured screens are the source of truth: every card the game showed in a
// draft or a memory must be one the matching picker offers.
const read = (path) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));

const drafts = read("draftPickBoxes.jsonl");
const memories = read("memoryBoxes.jsonl").filter((m) => m.pIdolId);

const refused = (filter, ids) =>
  ids
    .filter(Boolean)
    .map(SkillCards.getById)
    .filter((card) => !filter.callback(card))
    .map((card) => `${card.id} ${card.name}`);

test("the draft picker offers every card a captured draft showed", () => {
  for (const draft of drafts) {
    assert.deepEqual(refused(DRAFT_FILTER, draft.cards), [], draft.file);
  }
});

test("a draft can offer other P-idols' unique cards (活動支給, draft/07)", () => {
  const draft = drafts.find((d) => d.file.endsWith("/07.png"));
  const cards = draft.cards.map(SkillCards.getById);
  assert.ok(cards.every((card) => card.sourceType == "pIdol"));
  assert.ok(cards.every((card) => DRAFT_FILTER.callback(card)));
});

test("a card taken from a draft can be entered as acquired", () => {
  for (const draft of drafts) {
    assert.deepEqual(refused(ACQUIRED_FILTER, draft.cards), [], draft.file);
  }
});

test("every card in a captured memory, other than its own unique card, can be entered as acquired and as a target", () => {
  for (const memory of memories) {
    const own = new Set(
      SkillCards.getFiltered({ pIdolIds: [memory.pIdolId] }).map((c) => c.id),
    );
    const ids = memory.skillCards.filter((id) => id && !own.has(id));
    assert.ok(PIdols.getById(memory.pIdolId), memory.file);
    assert.deepEqual(refused(ACQUIRED_FILTER, ids), [], memory.file);
    assert.deepEqual(refused(TARGET_FILTER, ids), [], memory.file);
  }
});

test("the P-idol's own unique card is never a target: it is always in the memory", () => {
  for (const card of SkillCards.getAll().filter((c) => c.sourceType == "pIdol")) {
    assert.equal(TARGET_FILTER.callback(card), false, card.name);
  }
});
