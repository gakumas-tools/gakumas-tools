import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillCards } from "gakumas-data";
import { IdolConfig, StageEngine, S } from "gakumas-engine";

const FIXTURES = [
  "training-exam-impression",
  "training-exam-motivation",
];

function loadCapture(name) {
  const url = new URL(`./fixtures/ingame/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

function getTypeMultipliers(capture) {
  const typeMultipliers = {};
  for (const [type, percent] of Object.entries(capture.displayedPercents)) {
    typeMultipliers[type] = percent / 100;
  }
  return typeMultipliers;
}

function createEngine(capture, play) {
  const cardIds = new Set(play.actions.map((action) => action.cardId));
  const idol = new IdolConfig({
    params: [0, 0, 0, capture.initial.stamina],
    pItemIds: [],
    skillCardIdGroups: [[...cardIds]],
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

function putInHand(state, card) {
  for (const pile of [S.handCards, S.deckCards, S.discardedCards]) {
    state[pile] = state[pile].filter((c) => c != card);
  }
  state[S.handCards] = [card];
}

function replay(capture, play) {
  const engine = createEngine(capture, play);
  let state = engine.startStage(engine.getInitialState());
  engine.logger.disable();

  for (const [field, value] of Object.entries(capture.initial)) {
    assert.equal(state[S[field]], value, `initial ${field}`);
  }

  for (const [i, action] of play.actions.entries()) {
    const turn = i + 1;
    assert.equal(SkillCards.getById(action.cardId).name, action.name);

    const card = state[S.cardMap].findIndex((c) => c.id == action.cardId);
    assert.ok(!state[S.removedCards].includes(card), `${action.name} removed`);
    putInHand(state, card);
    assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
    state = engine.useCard(state, card);

    assert.equal(state[S.turnsElapsed], turn);
    for (const [field, value] of Object.entries(action.expected)) {
      assert.equal(
        state[S[field]],
        value,
        `turn ${turn} ${field} (${action.capture})`,
      );
    }
  }
}

for (const capture of FIXTURES.map(loadCapture)) {
  for (const play of capture.plays) {
    test(`in-game ${capture.stage}: ${play.id}`, () => replay(capture, play));
  }
}
