import { test } from "node:test";
import assert from "node:assert/strict";
import { SkillCards } from "gakumas-data";
import { G, S, getBaseId } from "gakumas-engine";
import { createEngine, parseActions } from "../helpers.mjs";

const TODOITE_PLUS = 153;
const HEART_NO_AIZU_PLUS = 93;
const YUMEIRO_LIP_PLUS = 521;

function setup(skillCardIds) {
  const engine = createEngine({ skillCardIds });
  const state = engine.getInitialState(true);
  const cardOf = (id) => state[S.cardMap].findIndex((c) => c.id === id);
  return { cardManager: engine.cardManager, state, cardOf };
}

test("Cards that only reduce genki are not genki effect cards", () => {
  const { cardManager, state, cardOf } = setup([
    TODOITE_PLUS,
    HEART_NO_AIZU_PLUS,
    YUMEIRO_LIP_PLUS,
  ]);
  const effects = (id) => cardManager.getCardEffects(state, cardOf(id));

  assert.equal(effects(TODOITE_PLUS).has("genki"), false);
  assert.equal(effects(TODOITE_PLUS).has("score"), true);
  assert.equal(effects(HEART_NO_AIZU_PLUS).has("genki"), false);
  assert.equal(effects(YUMEIRO_LIP_PLUS).has("genki"), true);
});

test("Reductions in costs still count as costs", () => {
  const { cardManager, state, cardOf } = setup([TODOITE_PLUS]);

  assert.equal(
    cardManager.getCardCosts(state, cardOf(TODOITE_PLUS)).has("stamina"),
    true,
  );
});

test("a perfectConditionTurns cost must be payable", () => {
  // 776 話題沸騰+: if:goodConditionTurns>=8, cost perfectConditionTurns-=1
  const engine = createEngine({ params: [1000, 1000, 1000, 50], skillCardIds: [776] });
  const state = engine.getInitialState();
  const card = state[S.cardMap].findIndex((c) => c.id === 776);
  state[S.goodConditionTurns] = 8;
  state[S.perfectConditionTurns] = 0;
  assert.equal(engine.cardManager.isCardUsable(state, card), false);
  state[S.perfectConditionTurns] = 1;
  assert.equal(engine.cardManager.isCardUsable(state, card), true);
});

test("holding a card triggers cardMovedToHeld", () => {
  // 787 グランドフィナーレ: at:cardMovedToHeld { if:movedCardId==787 {
  // target:held { g.scoreTimes+=1 } } }
  const engine = createEngine({ params: [1000, 1000, 1000, 50], skillCardIds: [787] });
  const state = engine.getInitialState();
  const card = state[S.cardMap].findIndex((c) => c.id === 787);
  engine.cardManager.holdCard(state, 787);
  assert.deepEqual(state[S.heldCards], [card]);
  assert.equal(state[S.cardMap][card].growth?.[G["g.scoreTimes"]], 1);
});

// Idol Road card primitives. UNVERIFIED: these rules are not yet checked
// against a capture. 19 目線の基本 is a basic card; 153 届いて！+ is not.
const BASIC = 19;
const NOT_BASIC = TODOITE_PLUS;

function pilesOf(state) {
  const ids = (pile) => state[pile].map((k) => state[S.cardMap][k].id);
  return {
    hand: ids(S.handCards),
    deck: ids(S.deckCards),
    discarded: ids(S.discardedCards),
    removed: ids(S.removedCards),
  };
}

function setupPiles() {
  const engine = createEngine({ params: [1000, 1000, 1000, 50] });
  const state = engine.getInitialState(true);
  // 0-2 basic, 3-4 not basic.
  state[S.cardMap] = [BASIC, BASIC, BASIC, NOT_BASIC, NOT_BASIC].map((id) => ({
    id,
    baseId: id,
  }));
  state[S.handCards] = [0, 3];
  state[S.deckCards] = [4, 1];
  state[S.discardedCards] = [2];
  state[S.removedCards] = [];
  state[S.heldCards] = [];
  return { engine, state };
}

test("addCardToDiscarded creates the card in the discard pile", () => {
  const { engine, state } = setupPiles();
  const before = state[S.cardMap].length;
  engine.executor.executeActions(
    state,
    parseActions(`addCardToDiscarded(${NOT_BASIC})`),
  );
  assert.equal(state[S.cardMap].length, before + 1);
  assert.deepEqual(pilesOf(state).discarded, [BASIC, NOT_BASIC]);
});

test("removeAll removes every matching card from deck, discards and hand", () => {
  const { engine, state } = setupPiles();
  engine.executor.executeActions(
    state,
    parseActions("removeAll[basic & (deck | discarded | hand)]"),
  );
  assert.deepEqual(pilesOf(state), {
    hand: [NOT_BASIC],
    deck: [NOT_BASIC],
    discarded: [],
    removed: [BASIC, BASIC, BASIC],
  });
});

test("moveAllToBottomOfDeck puts every matching card under the deck", () => {
  const { engine, state } = setupPiles();
  engine.executor.executeActions(
    state,
    parseActions("moveAllToBottomOfDeck[basic]"),
  );
  const piles = pilesOf(state);
  assert.deepEqual(piles.hand, [NOT_BASIC]);
  assert.deepEqual(piles.discarded, []);
  // Bottom of the deck is index 0; the top (drawn next) is the end.
  assert.deepEqual(piles.deck, [BASIC, BASIC, BASIC, NOT_BASIC]);
  assert.deepEqual(state[S.deckCards], [0, 1, 2, 4]);
});

test("copySelectedToBottomOfDeckUpto copies the picked card, growth included", () => {
  const { engine, state } = setupPiles();
  const picked = state[S.handCards][1];
  state[S.cardMap][picked] = {
    ...state[S.cardMap][picked],
    growth: { [G["g.score"]]: 3 },
  };
  let asked;
  engine.strategy = {
    pickCardsToCopy: (s, cards, num, optional) => {
      asked = { num, optional };
      return [cards.indexOf(picked)];
    },
  };
  engine.executor.executeActions(
    state,
    parseActions("copySelectedToBottomOfDeckUpto[hand](2)"),
  );
  assert.deepEqual(asked, { num: 2, optional: true });
  const copy = state[S.deckCards][0];
  assert.notEqual(copy, picked);
  assert.equal(state[S.cardMap][copy].id, NOT_BASIC);
  assert.deepEqual(state[S.cardMap][copy].growth, { [G["g.score"]]: 3 });
  assert.deepEqual(pilesOf(state).hand, [BASIC, NOT_BASIC]);
});

test("copySelectedToBottomOfDeckUpto may copy nothing", () => {
  const { engine, state } = setupPiles();
  engine.strategy = { pickCardsToCopy: () => [] };
  const before = pilesOf(state);
  engine.executor.executeActions(
    state,
    parseActions("copySelectedToBottomOfDeckUpto[hand](1)"),
  );
  assert.deepEqual(pilesOf(state), before);
});

test("スキルカードサポート raises base to +, + to ++, and stops at ++ or an unread ++", () => {
  // 手拍子 44 → 手拍子+ 45 → 手拍子++; ふれあい+ 123 → ふれあい++ (run #10's popup);
  // 200%スマイル+ 149 has no ++ read from the game yet.
  const engine = createEngine({ skillCardIds: [44, 123, 149] });
  const state = engine.getInitialState(true);
  const clap = state[S.cardMap].findIndex((c) => c.id === 44);
  const touch = state[S.cardMap].findIndex((c) => c.id === 123);
  const smile = state[S.cardMap].findIndex((c) => c.id === 149);
  const name = (card) => SkillCards.getById(state[S.cardMap][card].id).name;

  assert.equal(engine.cardManager.supportUpgrade(state, clap), true);
  assert.equal(name(clap), "手拍子+");
  assert.equal(engine.cardManager.supportUpgrade(state, clap), true);
  assert.equal(name(clap), "手拍子++");
  assert.equal(state[S.cardMap][clap].baseId, 44);
  assert.equal(engine.cardManager.supportUpgrade(state, clap), false);
  assert.equal(engine.cardManager.supportUpgrade(state, touch), true);
  assert.equal(name(touch), "ふれあい++");
  assert.equal(state[S.cardMap][touch].id, 10123);
  assert.equal(engine.cardManager.supportUpgrade(state, smile), false);
  assert.equal(name(smile), "200%スマイル+");
});

test("run #11's ++ popups: 前途洋々++, 元気な挨拶++ and a support's 紅葉ランニング++", () => {
  // 前途洋々+ 71 → ++ (cost 3, スコア+13); 元気な挨拶+ 47 → ++ (元気の140%);
  // 紅葉ランニング+ 453 (support card) → ++ (adds 元気+1).
  const engine = createEngine({ skillCardIds: [71, 47, 453] });
  const state = engine.getInitialState(true);
  const name = (card) => SkillCards.getById(state[S.cardMap][card].id).name;
  for (const [id, plusPlus] of [[71, "前途洋々++"], [47, "元気な挨拶++"], [453, "紅葉ランニング++"]]) {
    const card = state[S.cardMap].findIndex((c) => c.id === id);
    assert.equal(engine.cardManager.supportUpgrade(state, card), true);
    assert.equal(name(card), plusPlus);
    assert.equal(state[S.cardMap][card].id, 10000 + id);
    assert.equal(state[S.cardMap][card].baseId, id - 1);
  }
});

test("run #14's ++ popup: パステル気分++ costs 2", () => {
  // L5 lesson (run #14): パステル気分+ 67 → ++ shows 元気+7, やる気≥3 → 好印象+4 at cost 2 (+ is 3).
  const engine = createEngine({ skillCardIds: [67] });
  const state = engine.getInitialState(true);
  const card = state[S.cardMap].findIndex((c) => c.id === 67);
  assert.equal(engine.cardManager.supportUpgrade(state, card), true);
  const plusPlus = SkillCards.getById(state[S.cardMap][card].id);
  assert.equal(plusPlus.name, "パステル気分++");
  assert.equal(state[S.cardMap][card].id, 10067);
  assert.equal(state[S.cardMap][card].baseId, 66);
  assert.equal(plusPlus.cost[0].actions[0].rhs.value, 2);
});

test("++ cards are found by id but never listed", () => {
  const plusPlus = SkillCards.getPlusPlus(45);
  assert.equal(plusPlus.name, "手拍子++");
  assert.equal(SkillCards.getById(plusPlus.id), plusPlus);
  assert.equal(getBaseId(plusPlus), 44);
  assert.ok(!SkillCards.getAll().some((c) => c.upgradeLevel == 2));
  assert.ok(
    !SkillCards.getFiltered({ sourceTypes: ["produce"] }).some(
      (c) => c.upgradeLevel == 2,
    ),
  );
});
