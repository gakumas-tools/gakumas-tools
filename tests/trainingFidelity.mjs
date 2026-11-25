import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
  const idol = new IdolConfig({
    params: [0, 0, 0, capture.initial.stamina],
    pItemIds: capture.pItemIds ?? [],
    skillCardIdGroups: [cardIds],
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

function findCopy(state, cardId, hand) {
  return state[S.cardMap].findIndex(
    (c, index) =>
      c.id == cardId &&
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
      (c) => state[S.cardMap][c].id == action.cardId,
    );
    assert.ok(card !== undefined, `no card ${action.cardId} in hand`);
    return [card];
  }

  const hand = [];
  for (const cardId of action.handCardIds ?? [action.cardId]) {
    const card = findCopy(state, cardId, hand);
    assert.ok(card >= 0, `no copy of card ${cardId} left`);
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

function holdAsCaptured(hold, onHold) {
  return {
    pickCardsToHold(state, candidates, count, optional) {
      assert.ok(hold, "held a card the capture didn't");
      assert.equal(count, 1);
      assert.equal(optional, false);
      const candidateIds = candidates.map((c) => state[S.cardMap][c].id);
      assert.deepEqual(candidateIds, hold.candidateIds);
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
  for (const [i, action] of play.actions.entries()) {
    const turn = i + 1;
    if (action.skip) {
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
    const card = action.useReturnedHeldCard
      ? heldCard
      : action.fromDrink
        ? hand.findLast((c) => state[S.cardMap][c].id == action.cardId)
        : hand.find((c) => state[S.cardMap][c].id == action.cardId);
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
    state = engine.useCard(state, card);

    assert.equal(holds, action.hold ? 1 : 0);
    assert.equal(state[S.turnsElapsed], action.turnsElapsed ?? turn);
    if (action.heldCardIds) {
      const heldIds = state[S.heldCards].map((c) => state[S.cardMap][c].id);
      assert.deepEqual(heldIds, action.heldCardIds);
    }
    if (action.returnedHeldCardId) {
      assert.equal(state[S.cardMap][heldCard].id, action.returnedHeldCardId);
      assert.ok(state[S.handCards].includes(heldCard), "held card in hand");
    }
    for (const [field, value] of Object.entries(action.expected)) {
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
