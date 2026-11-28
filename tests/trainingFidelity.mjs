import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Customizations,
  PDrinks,
  ProduceExams,
  SkillCards,
  deserializeEffectSequence,
} from "gakumas-data";
import { IdolConfig, StageConfig, StageEngine, S, G } from "gakumas-engine";
import { hasIngameFixtures, loadIngameFixture } from "./ingameFixtures.mjs";

const FIXTURES = [
  "training-exam-impression",
  "training-exam-motivation",
  "training-lesson-cost-reduction",
  "training-lesson-flat-cost-reduction",
  "training-lesson-full-power",
  "training-lesson-strength",
  "training-lesson-preservation",
  "training-exam-full-power",
  "training-exam-strength",
  "training-lesson-anomaly",
  "training-lesson-growth",
  "training-lesson-good-condition",
  "training-lesson-concentration",
  "training-lesson-impression",
  "training-lesson-motivation",
  "training-exam-good-condition",
  "training-exam-concentration",
  "training-lesson-sense",
  "training-lesson-logic",
  "produce-exam-impression",
  "produce-exam-good-condition",
  "produce-exam-impression-final",
  "produce-exam-impression-final-r9",
  "produce-exam-impression-final-r9b",
  "produce-exam-preservation-final",
  "produce-exam-preservation-midterm",
  "produce-exam-leisure-stamina",
  "produce-exam-preservation-midterm-passed",
  "produce-exam-misuzu-run2-midterm",
  "produce-exam-misuzu-run2-final",
  "produce-exam-misuzu-run2-midterm-passed",
  "produce-exam-misuzu-run2-final-to-turn9",
  "produce-exam-misuzu-run2-final-to-11658",
  "produce-exam-impression-final-r10",
  "produce-exam-impression-final-r10b",
  "produce-exam-impression-final-r11",
  "produce-exam-impression-final-r11b",
  "produce-exam-impression-final-r12",
  "produce-exam-impression-final-r13",
  "produce-exam-impression-final-r13b",
  "produce-exam-impression-final-r13c",
  "produce-exam-impression-final-r13d",
  "produce-exam-impression-final-r14",
  "produce-exam-impression-final-r14b",
  "produce-exam-impression-final-r14c",
  "produce-exam-impression-final-r14d",
  "produce-exam-impression-final-r15",
  "produce-exam-impression-final-r15b",
  "produce-exam-impression-final-r15c",
  "produce-exam-impression-final-r15d",
  "produce-exam-impression-final-r16",
  "produce-exam-impression-final-r16b",
  "produce-exam-impression-final-r16c",
  "produce-exam-impression-final-r16d",
  "produce-exam-impression-final-r18d",
  "produce-exam-impression-final-r19d",
  "produce-exam-impression-final-r20d",
  "produce-exam-impression-final-r23d",
  "produce-exam-impression-final-r24c",
  "produce-exam-impression-final-r25b",
  "produce-exam-impression-final-r25c",
  "produce-exam-misuzu-drink-midturn",
  "produce-exam-misuzu-g1256-final-to-turn2",
  "produce-exam-misuzu-g1337-final2-to-turn9",
  "produce-exam-suzuka-g1358-final-to-turn12",
  "produce-exam-misuzu-g1436-final-retry-to-turn8",
  "produce-exam-misuzu-g1436-final-retry",
  "produce-exam-saki-hif-r2-ranked-to-turn2",
  "produce-exam-saki-hif-r2-ranked-to-turn10",
  "produce-exam-saki-hif-r2-ranked-abilities-to-turn10",
];

// Captures of a produce exam that has a ProduceExams row replay through
// that row (its gifts) and the turn order the game showed, the way the
// simulator would run them, instead of a stage built from the capture.
const PRODUCE_EXAM_IDS = {
  "produce-exam-impression-final-r9": 1,
  "produce-exam-impression-final-r9b": 1,
  "produce-exam-impression-final-r10": 1,
  "produce-exam-impression-final-r10b": 1,
  "produce-exam-impression-final-r11": 1,
  "produce-exam-impression-final-r11b": 1,
  "produce-exam-impression-final-r12": 1,
  "produce-exam-impression-final-r13": 1,
  "produce-exam-impression-final-r13b": 1,
  "produce-exam-impression-final-r13c": 1,
  "produce-exam-impression-final-r13d": 1,
  "produce-exam-impression-final-r14": 1,
  "produce-exam-impression-final-r14b": 1,
  "produce-exam-impression-final-r14c": 1,
  "produce-exam-impression-final-r14d": 1,
  "produce-exam-impression-final-r15": 1,
  "produce-exam-impression-final-r15b": 1,
  "produce-exam-impression-final-r15c": 1,
  "produce-exam-impression-final-r15d": 1,
  "produce-exam-impression-final-r16": 1,
  "produce-exam-impression-final-r16b": 1,
  "produce-exam-impression-final-r16c": 1,
  "produce-exam-impression-final-r16d": 1,
  "produce-exam-impression-final-r18d": 1,
  "produce-exam-impression-final-r19d": 1,
  "produce-exam-impression-final-r20d": 1,
  "produce-exam-impression-final-r23d": 1,
  "produce-exam-impression-final-r24c": 1,
  "produce-exam-impression-final-r25b": 1,
  "produce-exam-impression-final-r25c": 1,
};

function getStage(capture) {
  const examId = PRODUCE_EXAM_IDS[capture.fixture];
  if (!examId) {
    return {
      type: "capturedTraining",
      turnCount: capture.turnTypes.length,
      passScore: capture.passScore,
      effects: (capture.stageEffects ?? []).flatMap((e) =>
        deserializeEffectSequence(e.effect),
      ),
    };
  }
  const exam = ProduceExams.getById(examId);
  return new StageConfig({ ...exam, turnTypes: capture.turnTypes });
}

function getTypeMultipliers(capture) {
  if (capture.replayMultipliers) return capture.replayMultipliers;

  const typeMultipliers = {};
  for (const [type, percent] of Object.entries(capture.displayedPercents)) {
    typeMultipliers[type] = percent / 100;
  }
  return typeMultipliers;
}

function createEngine(capture, play) {
  const cardIds = capture.drawCardIds ?? [
    ...play.actions.flatMap((action) =>
      // earlierCopy: the copy an earlier action supplied, raised since, so
      // it adds none (one-copy cards like 200%スマイル keep only one).
      action.skip || action.fromHand || action.earlierCopy
        ? []
        : action.fromDrink
          ? (action.handCardIds ?? []).filter((id) => id != action.cardId)
          : [
              ...(action.handCardIds ?? [action.cardId]),
              ...(action.drawnCardIds ?? []),
            ],
    ),
    // Cards the game drew but that were never played (nextTurnDraw).
    ...(capture.extraCardIds ?? []),
  ];
  // IdolConfig drops a customization it doesn't know, so check them here.
  for (const [cardId, value] of Object.entries(capture.cardCustomizations ?? {})) {
    assert.ok(cardIds.includes(Number(cardId)), `customized ${cardId} not in deck`);
    if (Array.isArray(value)) {
      const copies = cardIds.filter((id) => id == cardId).length;
      assert.equal(value.length, copies, `customized ${cardId}: one entry per copy`);
    }
    for (const c11n of [value].flat()) {
      for (const [id, level] of Object.entries(c11n)) {
        assert.ok(Customizations.getById(id), `no customization ${id}`);
        assert.ok(level > 0, `customization ${id} level ${level}`);
      }
    }
  }
  // A copy's customization: an array value gives one per copy, in deck order.
  const seen = {};
  const c11nOf = (id) => {
    const value = capture.cardCustomizations?.[id];
    if (!Array.isArray(value)) return value;
    seen[id] = (seen[id] ?? 0) + 1;
    return value[seen[id] - 1];
  };
  const idol = new IdolConfig({
    // maxStamina: the run's max 体力 when the exam starts below it (a
    // produce exam starts at the 体力 the run had), so heals cap there.
    params: [0, 0, 0, capture.maxStamina ?? capture.initial.stamina],
    startStamina: capture.initial.stamina,
    pItemIds: capture.pItemIds ?? [],
    // engineDrinks: the drinks are held and drunk through the engine.
    pDrinkIds: capture.engineDrinks ? capture.pDrinkIds : undefined,
    skillCardIdGroups: [cardIds],
    // cardCustomizations: { "<cardId>": { "<customizationId>": level } },
    // the カスタマイズ the game showed on that card (カスタマイズ詳細),
    // applied to every copy of the id. When the copies differ, the value is
    // an array with one entry per copy ({} for an uncustomized one), and each
    // action names its copy's customization (action.customizations).
    customizationGroups: [cardIds.map(c11nOf)],
    // memoryAbilities: [{ text, capture, effects }], each メモリーアビリティ
    // the game showed for the loadout's memories, word for word in text,
    // and the effect string it reads as.
    memoryAbilities: (capture.memoryAbilities ?? []).map((a) => {
      assert.ok(a.text && a.capture && a.effects, "memory ability fields");
      return a.effects;
    }),
  });
  const engine = new StageEngine({
    idol,
    defaultCardIds: [],
    typeMultipliers: getTypeMultipliers(capture),
    stage: getStage(capture),
  });
  if (!PRODUCE_EXAM_IDS[capture.fixture]) {
    engine.turnManager.generateTurnTypes = () => [...capture.turnTypes];
  }
  return engine;
}

// The customization of a cardMap entry, as { "<customizationId>": level }
// with nothing for none, so it can be compared with a capture's.
function c11nKey(c11n) {
  return JSON.stringify(
    Object.entries(c11n ?? {})
      .filter(([, level]) => level)
      .map(([id, level]) => [String(id), level])
      .sort(),
  );
}

// c11n: only a copy with exactly this customization ({} = none) matches.
function findCopy(state, cardId, hand, c11n) {
  return state[S.cardMap].findIndex(
    (c, index) =>
      c.id == cardId &&
      (c11n === undefined || c11nKey(c.c11n) == c11nKey(c11n)) &&
      !state[S.removedCards].includes(index) &&
      !state[S.heldCards].includes(index) &&
      !hand.includes(index),
  );
}

function supplyHand(state, action, heldCard) {
  if (action.useReturnedHeldCard) return [heldCard];
  // fromHand: the copy the engine already has in hand (drawn via
  // nextTurnDraw and raised there), not a fresh one.
  if (action.fromHand) {
    const card = state[S.handCards].find(
      (c) =>
        state[S.cardMap][c].id == action.cardId &&
        (action.customizations === undefined ||
          c11nKey(state[S.cardMap][c].c11n) == c11nKey(action.customizations)),
    );
    assert.ok(card !== undefined, `no card ${action.cardId} in hand`);
    return [card];
  }

  const hand = [];
  // customizations: the played copy's カスタマイズ, so the copy supplied for
  // action.cardId is the one the game played. handCustomizations: one per
  // handCardIds entry (null = any copy), for a copy that stays in hand.
  let named = action.customizations;
  for (const [i, cardId] of (action.handCardIds ?? [action.cardId]).entries()) {
    let c11n = action.handCustomizations?.[i] ?? undefined;
    if (cardId == action.cardId) {
      c11n ??= named;
      named = undefined;
    }
    let card = findCopy(state, cardId, hand, c11n);
    assert.ok(card >= 0, `no copy of card ${cardId} left`);
    // A copy the engine already drew, if it's the same as the one found, so
    // the copy left in the deck is the one the game left there.
    const same = JSON.stringify(state[S.cardMap][card]);
    const drawn = state[S.handCards].find(
      (c) => !hand.includes(c) && JSON.stringify(state[S.cardMap][c]) == same,
    );
    if (drawn !== undefined) card = drawn;
    hand.push(card);
  }
  return hand;
}

function putInHand(state, hand) {
  for (const pile of [S.handCards, S.deckCards, S.discardedCards]) {
    state[pile] = state[pile].filter((c) => !hand.includes(c));
  }
  state[S.handCards] = hand;
}

// A P-drink, as the game used it. One that puts a random card in the hand
// (初星スペシャル青汁) puts the card the game showed: a new copy, so nothing
// that grew the deck's cards has grown it.
function drinkAsCaptured(engine, state, drink) {
  const pDrink = PDrinks.getById(drink.id);
  assert.equal(pDrink.name, drink.name);
  const cardManager = engine.cardManager;
  if (drink.addsCardId) {
    cardManager.addRandomUpgradedCardToHand = (s) =>
      cardManager.addCardToHand(s, drink.addsCardId);
  }
  try {
    engine.effectManager.triggerEffects(state, pDrink.actions);
  } finally {
    delete cardManager.addRandomUpgradedCardToHand;
  }
}

// engineDrinks: each drink is drunk through the engine, from those held,
// at the point the game showed (before the action it's listed on).
function drinkThroughEngine(engine, state, drinks) {
  for (const drink of drinks) {
    assert.equal(PDrinks.getById(drink.id).name, drink.name);
    const index = engine.getHeldPDrinks(state).indexOf(drink.id);
    assert.ok(index >= 0, `P-drink ${drink.name} not held`);
    state = engine.usePDrink(state, index);
  }
  return state;
}

function holdAsCaptured(hold, onHold) {
  return {
    pickCardsToHold(state, candidates, count, optional) {
      assert.ok(hold, "held a card the capture didn't");
      assert.equal(count, 1);
      assert.equal(optional, false);
      const candidateIds = candidates.map((c) => state[S.cardMap][c].id);
      // No candidateIds: the game showed which card went to 保留 but not
      // the order it offered them in (a hold from 山札/捨札, e.g. ほっと緑茶).
      // Pick it by id; copies that differ (growth, customizations) can't be
      // told apart, so they fail rather than guess.
      if (hold.candidateIds) {
        assert.deepEqual(candidateIds, hold.candidateIds);
      } else {
        const copies = candidates.filter(
          (c) => state[S.cardMap][c].id == hold.selectedId,
        );
        assert.ok(copies.length > 0, `no ${hold.selectedId} to hold`);
        const entries = new Set(
          copies.map((c) => JSON.stringify(state[S.cardMap][c])),
        );
        assert.equal(entries.size, 1, `copies of ${hold.selectedId} differ`);
      }
      const choice = candidateIds.indexOf(hold.selectedId);
      onHold(candidates[choice]);
      return [choice];
    },
  };
}

function replay(capture, play) {
  const engine = createEngine(capture, play);
  const initialState = engine.getInitialState();
  initialState[S.genki] = capture.initial.genki;
  if (capture.drawCardIds) {
    const deck = [];
    for (const cardId of capture.drawCardIds) {
      const card = findCopy(initialState, cardId, deck);
      assert.ok(card >= 0, `no copy of card ${cardId} left`);
      deck.push(card);
    }
    initialState[S.deckCards] = deck.reverse();
  }
  // initialGrowth: { "<cardId>": { "g.score": n } }, growth the ログ shows
  // the cards already had when the exam started (the 成長 lines before turn
  // 1, e.g. from a P-item), added to every copy of the id.
  for (const [cardId, growth] of Object.entries(capture.initialGrowth ?? {})) {
    const copies = initialState[S.cardMap]
      .map((entry, card) => (entry.id == cardId ? card : -1))
      .filter((card) => card >= 0);
    assert.ok(copies.length > 0, `grown ${cardId} not in deck`);
    for (const card of copies) {
      const entry = initialState[S.cardMap][card];
      const next = { ...entry, growth: { ...entry.growth } };
      for (const [field, value] of Object.entries(growth)) {
        assert.ok(field in G, `no growth field ${field}`);
        next.growth[G[field]] = (next.growth[G[field]] ?? 0) + value;
      }
      initialState[S.cardMap][card] = next;
    }
  }
  let state = engine.startStage(initialState);
  engine.logger.disable();

  // afterStageStart: the state the ログ shows once turn 1 has started, when a
  // start-of-turn P-item (e.g. 星のリトルプリンス) has already changed it.
  for (const [field, value] of Object.entries(
    capture.afterStageStart ?? capture.initial,
  )) {
    assert.equal(state[S[field]], value, `initial ${field}`);
  }

  let heldCard;
  for (let [i, action] of play.actions.entries()) {
    const turn = i + 1;
    if (capture.engineDrinks && action.drinksBefore) {
      state = drinkThroughEngine(engine, state, action.drinksBefore);
      action = { ...action, drinksBefore: undefined };
    }
    if (action.skip) {
      // Drinks taken on a turn whose card play was skipped.
      for (const drink of action.drinksBefore ?? []) {
        const pDrink = PDrinks.getById(drink.id);
        assert.equal(pDrink.name, drink.name);
        engine.effectManager.triggerEffects(state, pDrink.actions);
      }
      state = engine.endTurn(state);
      assert.equal(state[S.turnsElapsed], action.turnsElapsed ?? turn);
      for (const [field, value] of Object.entries(action.expected)) {
        assert.equal(state[S[field]], value, `turn ${turn} ${field} (skip)`);
      }
      continue;
    }
    assert.equal(SkillCards.getById(action.cardId).name, action.name);

    // drinksBeforeHand: drinks the game showed before the hand the play
    // came from (ミックススムージー redraws the hand), so they act on the
    // engine's hand before the captured one is supplied.
    for (const drink of action.drinksBeforeHand ?? []) {
      const pDrink = PDrinks.getById(drink.id);
      assert.equal(pDrink.name, drink.name);
      engine.effectManager.triggerEffects(state, pDrink.actions);
    }

    let hand;
    if (capture.drawCardIds) {
      hand = state[S.handCards];
      const cardIds = hand.map((c) => state[S.cardMap][c].id);
      assert.deepEqual(
        cardIds,
        action.handCardIds,
        `turn ${turn} hand (${action.handCapture})`,
      );
    } else if (action.fromDrink) {
      // The card a drink just put in the hand, with the hand the game showed
      hand = supplyHand(state, {
        handCardIds: (action.handCardIds ?? []).filter(
          (id) => id != action.cardId,
        ),
      });
      putInHand(state, hand);
      for (const drink of action.drinksBefore ?? []) {
        drinkAsCaptured(engine, state, drink);
      }
      hand = state[S.handCards];
    } else {
      hand = supplyHand(state, action, heldCard);
      putInHand(state, hand);
    }
    const played = (c) =>
      state[S.cardMap][c].id == action.cardId &&
      (action.customizations === undefined ||
        c11nKey(state[S.cardMap][c].c11n) == c11nKey(action.customizations));
    const card = action.useReturnedHeldCard
      ? heldCard
      : action.fromDrink
        ? hand.findLast(played)
        : hand.find(played);
    assert.ok(card !== undefined, `turn ${turn}: no ${action.cardId} in hand as played`);
    for (const [field, value] of Object.entries(action.growthBefore ?? {})) {
      assert.equal(
        state[S.cardMap][card].growth[G[field]],
        value,
        `turn ${turn} ${field} (${action.growthCapture})`,
      );
    }

    // スキルカードサポート, as many levels as the card showed badges.
    for (let n = 0; n < (action.supportUpgrades ?? 0); n++) {
      engine.cardManager.supportUpgrade(state, card);
    }

    // hold.from: the pile the ログ says the held card came from (ほっと緑茶:
    // 「スターライト」を捨札から1枚保留に移動). The harness supplies hands
    // itself, so the engine's piles don't hold what the game's did: put a
    // copy of the card in that pile before the drink.
    if (action.hold?.from) {
      assert.ok(!action.fromDrink, `turn ${turn}: hold.from with fromDrink`);
      const pile = { deck: S.deckCards, discarded: S.discardedCards }[
        action.hold.from
      ];
      assert.ok(pile, `turn ${turn}: hold.from ${action.hold.from}`);
      const copy = findCopy(state, action.hold.selectedId, hand);
      assert.ok(copy >= 0, `turn ${turn}: no ${action.hold.selectedId} to hold`);
      for (const p of [S.deckCards, S.discardedCards]) {
        state[p] = state[p].filter((c) => c != copy);
      }
      state[pile].push(copy);
    }
    let holds = 0;
    engine.strategy = holdAsCaptured(action.hold, (held) => {
      holds++;
      heldCard = held;
    });
    // Cards the play draws, as the game showed them: put copies on top of
    // the deck so the engine draws the same ones.
    for (const cardId of [...(action.drawnCardIds ?? [])].reverse()) {
      const drawn = findCopy(state, cardId, hand);
      assert.ok(drawn >= 0, `no copy of card ${cardId} left to draw`);
      for (const pile of [S.deckCards, S.discardedCards]) {
        state[pile] = state[pile].filter((c) => c != drawn);
      }
      state[S.deckCards].push(drawn);
    }
    // redrawnCardIds: cards the play draws after its drawnCardIds empty the
    // 山札 and the 捨札 is shuffled into it (a card discarded earlier in the
    // same play can come back, as after 仕切り直し+). The rest of the 山札
    // goes to the 捨札 first, so the drawn cards are all that's left, and
    // the reshuffle puts the named cards on top in the order drawn.
    let recycle;
    if (action.redrawnCardIds) {
      const top = action.drawnCardIds ?? [];
      const keep = state[S.deckCards].slice(state[S.deckCards].length - top.length);
      const rest = state[S.deckCards].filter((c) => !keep.includes(c));
      state[S.discardedCards].push(...rest);
      state[S.deckCards] = keep;
      const manager = engine.cardManager;
      recycle = manager.recycleDiscards;
      let reshuffles = 0;
      manager.recycleDiscards = function (s) {
        recycle.call(this, s);
        reshuffles++;
        assert.equal(reshuffles, 1, `turn ${turn}: one reshuffle`);
        for (const cardId of [...action.redrawnCardIds].reverse()) {
          const at = s[S.deckCards].findLastIndex(
            (c) => s[S.cardMap][c].id == cardId,
          );
          assert.ok(at >= 0, `turn ${turn}: no ${cardId} in 捨札 to redraw`);
          const [copy] = s[S.deckCards].splice(at, 1);
          s[S.deckCards].push(copy);
        }
      };
    }
    if (!action.fromDrink) {
      for (const drink of action.drinksBefore ?? []) {
        drinkAsCaptured(engine, state, drink);
      }
    }
    if (action.playedName) {
      assert.equal(
        SkillCards.getById(state[S.cardMap][card].id).name,
        action.playedName,
        `turn ${turn}: played as`,
      );
    }
    // nextTurnDraw: the hand the ログ shows the next turn drawing, put on
    // top of the deck so start-of-turn effects (発動予約) act on it.
    if (action.nextTurnDraw) {
      const drawn = [];
      for (const entry of action.nextTurnDraw) {
        const cardId = entry.cardId ?? entry;
        const copy = findCopy(state, cardId, [...drawn, card]);
        assert.ok(copy >= 0, `turn ${turn}: no copy of card ${cardId} to draw`);
        // { cardId, supportUpgrades }: スキルカードサポート raised it as it
        // was drawn (the badge on the card in hand).
        for (let n = 0; n < (entry.supportUpgrades ?? 0); n++) {
          engine.cardManager.supportUpgrade(state, copy);
        }
        drawn.push(copy);
      }
      for (const pile of [S.deckCards, S.discardedCards]) {
        state[pile] = state[pile].filter((c) => !drawn.includes(c));
      }
      state[S.deckCards].push(...[...drawn].reverse());
    }
    assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
    try {
      state = engine.useCard(state, card);
    } finally {
      if (recycle) delete engine.cardManager.recycleDiscards;
    }

    assert.equal(holds, action.hold ? 1 : 0);
    assert.equal(state[S.turnsElapsed], action.turnsElapsed ?? turn, `action ${turn} turnsElapsed`);
    if (action.heldCardIds) {
      const heldIds = state[S.heldCards].map((c) => state[S.cardMap][c].id);
      assert.deepEqual(heldIds, action.heldCardIds);
    }
    if (action.returnedHeldCardId) {
      assert.equal(state[S.cardMap][heldCard].id, action.returnedHeldCardId);
      assert.ok(state[S.handCards].includes(heldCard), "held card in hand");
    }
    for (const [field, value] of Object.entries(action.expected)) {
      // removedCardIds: the ids in 除外 after the turn, sorted, as the ログ
      // shows cards moved there (e.g. 「眠気」 from 山札 to 除外).
      if (field == "removedCardIds") {
        const ids = state[S.removedCards]
          .map((c) => state[S.cardMap][c].id)
          .sort((a, b) => a - b);
        assert.deepEqual(ids, value, `turn ${turn} 除外 (${action.capture})`);
        continue;
      }
      // handCardIds: the ids in the 手札 after the play, sorted, as the ログ
      // shows the cards drawn.
      if (field == "handCardIds") {
        const ids = state[S.handCards]
          .map((c) => state[S.cardMap][c].id)
          .sort((a, b) => a - b);
        assert.deepEqual(ids, value, `turn ${turn} 手札 (${action.capture})`);
        continue;
      }
      assert.ok(field in S, `turn ${turn}: no field ${field}`);
      assert.equal(
        state[S[field]],
        value,
        `turn ${turn} ${field} (${action.capture})`,
      );
    }
  }

  if (play.terminalAttribute !== undefined) {
    const attribute =
      capture.initialAttribute + Math.min(state[S.score], capture.targetGain);
    assert.equal(attribute, play.terminalAttribute, "terminal attribute");
  }
}

for (const capture of hasIngameFixtures
  ? FIXTURES.map((name) => ({ ...loadIngameFixture(name), fixture: name }))
  : []) {
  for (const play of capture.plays) {
    test(`in-game ${capture.stage}: ${play.id}`, () => replay(capture, play));
  }
}
