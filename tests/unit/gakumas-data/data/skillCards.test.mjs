import { test } from "node:test";
import assert from "node:assert/strict";
import { Descriptions, SkillCards } from "gakumas-data";

// A card's effects column is registered at lesson start, while the card is
// still in the deck. An effect the game words as 以降 starts only once the
// card is used, so it belongs in the card's actions. In-deck effects are
// worded otherwise (再演, 成長, レッスン開始時…).
const IN_DECK = /^(再演|成長|レッスン開始時|.*手札にある)/;

test("a card whose text says 以降 doesn't start that effect at lesson start", () => {
  const wrong = SkillCards.getAll()
    .filter((card) => {
      const lines = (Descriptions.get(card) || "").split("\n");
      const afterUse = lines.some((l) => l.startsWith("以降") && !l.startsWith("以降の"));
      const inDeck = lines.some((l) => IN_DECK.test(l));
      return afterUse && !inDeck && card.effects.length > 0;
    })
    .map((card) => `${card.id} ${card.name}`);
  assert.deepEqual(wrong, []);
});
