import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillCards } from "gakumas-data";
import { IdolConfig, StageEngine, S, G } from "gakumas-engine";
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
];

function getTypeMultipliers(capture) {
  if (capture.replayMultipliers) return capture.replayMultipliers;

  const typeMultipliers = {};
  for (const [type, percent] of Object.entries(capture.displayedPercents)) {
    typeMultipliers[type] = percent / 100;
  }
  return typeMultipliers;
}

function createEngine(capture, play) {
  const cardIds =
    capture.drawCardIds ??
    play.actions.flatMap((action) => action.handCardIds ?? [action.cardId]);
  const idol = new IdolConfig({
    params: [0, 0, 0, capture.initial.stamina],
    pItemIds: capture.pItemIds ?? [],
    skillCardIdGroups: [cardIds],
  });
  const engine = new StageEngine({
    idol,
    defaultCardIds: [],
    typeMultipliers: getTypeMultipliers(capture),
    stage: {
      type: "capturedTraining",
      turnCount: capture.turnTypes.length,
      effects: [],
    },
  });
  engine.turnManager.generateTurnTypes = () => [...capture.turnTypes];
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

  for (const [field, value] of Object.entries(capture.initial)) {
    assert.equal(state[S[field]], value, `initial ${field}`);
  }

  let heldCard;
  for (const [i, action] of play.actions.entries()) {
    const turn = i + 1;
    assert.equal(SkillCards.getById(action.cardId).name, action.name);

    let hand;
    if (capture.drawCardIds) {
      hand = state[S.handCards];
      const cardIds = hand.map((c) => state[S.cardMap][c].id);
      assert.deepEqual(
        cardIds,
        action.handCardIds,
        `turn ${turn} hand (${action.handCapture})`,
      );
    } else {
      hand = supplyHand(state, action, heldCard);
      putInHand(state, hand);
    }
    const card = action.useReturnedHeldCard
      ? heldCard
      : hand.find((c) => state[S.cardMap][c].id == action.cardId);
    for (const [field, value] of Object.entries(action.growthBefore ?? {})) {
      assert.equal(
        state[S.cardMap][card].growth[G[field]],
        value,
        `turn ${turn} ${field} (${action.growthCapture})`,
      );
    }

    let holds = 0;
    engine.strategy = holdAsCaptured(action.hold, (held) => {
      holds++;
      heldCard = held;
    });
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

for (const capture of hasIngameFixtures ? FIXTURES.map(loadIngameFixture) : []) {
  for (const play of capture.plays) {
    test(`in-game ${capture.stage}: ${play.id}`, () => replay(capture, play));
  }
}
