import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillCards, Stages } from "gakumas-data";
import { IdolConfig, StageEngine, S } from "gakumas-engine";

const FIXTURES = [
  "training-exam-impression",
  "training-exam-motivation",
  "contest-rehearsal-s55-temari",
  "contest-rehearsal-s55-seika",
  "contest-rehearsal-s55-kotone",
  "contest-rehearsal-s55-temari-2",
  "contest-rehearsal-s55-seika-2",
  "contest-rehearsal-s55-kotone-2",
  "contest-rehearsal-s55-tsubame-2",
  "contest-rehearsal-s55-misuzu",
  "contest-rehearsal-s55-misuzu-2",
  "contest-rehearsal-s55-misuzu-3",
  "contest-rehearsal-s55-misuzu-7",
  "contest-rehearsal-s55-misuzu-20",
  "contest-rehearsal-s55-misuzu-22",
  "contest-rehearsal-s55-misuzu-24",
  "contest-rehearsal-s55-misuzu-25",
  "contest-rehearsal-s55-misuzu-36",
  "contest-rehearsal-s55-misuzu-37",
  "contest-rehearsal-s55-misuzu-42",
  "contest-rehearsal-s55-misuzu-45",
  "contest-rehearsal-s55-misuzu-46",
  "contest-rehearsal-s55-misuzu-48",
  "contest-rehearsal-s55-misuzu-50",
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
    params: [0, 0, 0, capture.startingStamina ?? capture.initial.stamina],
    pItemIds: capture.pItemIds ?? [],
    skillCardIdGroups: [capture.skillCardIds ?? [...cardIds]],
  });
  const engine = new StageEngine({
    idol,
    defaultCardIds: [],
    typeMultipliers: getTypeMultipliers(capture),
    stage: {
      type: "capturedTraining",
      turnCount: capture.turnTypes.length,
      // A contest stage's own effects, e.g. S55 stage 2's 好印象 bonus.
      effects: capture.stageId ? Stages.getById(capture.stageId).effects : [],
    },
  });
  engine.turnManager.generateTurnTypes = () => [...capture.turnTypes];
  return engine;
}

function putInHand(state, card) {
  for (const pile of [S.handCards, S.deckCards, S.discardedCards, S.heldCards]) {
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
    // One card a turn unless the action names its turn.
    const turn = action.turn ?? i + 1;
    const next = play.actions[i + 1];
    const endsTurn = !next || (next.turn ?? i + 2) != turn;
    assert.equal(SkillCards.getById(action.cardId).name, action.name);

    // Once-per-stage cards used twice come from two copies in the deck.
    const card = state[S.cardMap].findIndex(
      (c, i) => c.id == action.cardId && !state[S.removedCards].includes(i),
    );
    assert.ok(card >= 0, `${action.name} removed`);
    putInHand(state, card);
    assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
    state = engine.useCard(state, card);

    assert.equal(state[S.turnsElapsed], endsTurn ? turn : turn - 1);
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
