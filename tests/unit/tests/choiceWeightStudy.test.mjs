import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidates,
  deckKey,
  summarize,
} from "../../choiceWeightStudy.mjs";

test("candidates start with the baseline and cover every profile once", () => {
  const grid = candidates();
  assert.deepEqual(grid[0], {
    buff: 1,
    score: 1,
    stamina: 1,
    hand: 1,
    cardsUsed: 1,
  });
  const profiles = new Set(grid.map((weights) => JSON.stringify(weights)));
  assert.equal(profiles.size, 3125);
  assert.deepEqual(candidates(), grid);
});

test("decks with the same items and cards share a key", () => {
  const deck = {
    pItemIds: [1, 0, 2],
    skillCardIdGroups: [[25, 1]],
    customizationGroups: [[{ 65: 1 }, {}]],
  };
  const reordered = {
    pItemIds: [2, 1],
    skillCardIdGroups: [[1], [25]],
    customizationGroups: [[{}], [{ 65: 1 }]],
  };
  assert.equal(deckKey(reordered), deckKey(deck));

  reordered.customizationGroups[1][0][65] = 2;
  assert.notEqual(deckKey(reordered), deckKey(deck));
});

test("each deck counts once in a plan's mean gain", () => {
  const summary = summarize([
    { relativeGain: -0.1, gain: -100 },
    { relativeGain: 0.1, gain: 1 },
  ]);
  assert.equal(summary.meanRelativeGain, 0);
  assert.equal(summary.meanGain, -49.5);
  assert.equal(summary.improvedDecks, 1);
  assert.equal(summary.worseDecks, 1);
});
