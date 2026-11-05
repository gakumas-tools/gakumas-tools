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
  "contest-rehearsal-s55-sena",
  "contest-rehearsal-s55-sena-2",
  "contest-rehearsal-s55-sena-3",
  "contest-rehearsal-s55-sena-4",
  "contest-rehearsal-s55-sena-5",
  "contest-rehearsal-s55-sena-6",
  "contest-rehearsal-s55-saki",
  "contest-rehearsal-s55-saki-2",
  "contest-rehearsal-s55-ume",
  "contest-rehearsal-s55-ume-3663",
  "contest-rehearsal-s55-ume-3663-2",
  "contest-rehearsal-s55-ume-3663-3",
  "contest-rehearsal-s55-ume-3663-4",
  "contest-rehearsal-s55-ume-3663-5",
  "contest-rehearsal-s55-kotone-4866",
  "contest-rehearsal-s55-kotone-4536",
  "contest-rehearsal-s55-seika-5469",
  "contest-rehearsal-s55-seika-5469-2",
  "contest-rehearsal-s55-seika-5469-3",
  "contest-rehearsal-s55-seika-5469-4",
  "contest-rehearsal-s55-seika-5415",
  "contest-rehearsal-s55-seika-5415-2",
  "contest-rehearsal-s55-seika-5415-3",
  "contest-rehearsal-s55-kotone-5334-alone",
  "contest-rehearsal-s55-kotone-5334-alone-2",
  "contest-rehearsal-s55-kotone-5334-alone-3",
  "contest-rehearsal-s55-kotone-5334-alone-4",
  "contest-rehearsal-s55-kotone-5334-alone-5",
  "contest-rehearsal-s55-sena-7",
  "contest-rehearsal-s55-sena-8",
  "contest-rehearsal-s55-sena-9",
  "contest-rehearsal-s55-sena-10",
  "contest-rehearsal-s55-saki-3663",
  "contest-rehearsal-s55-saki-3663-2",
  "contest-rehearsal-s55-saki-3663-3",
  "contest-rehearsal-s55-saki-3663-4",
  "contest-rehearsal-s55-temari-5319",
  "contest-rehearsal-s55-temari-5319-2",
  "contest-rehearsal-s55-temari-5319-3",
  "contest-rehearsal-s55-temari-5319-4",
  "contest-rehearsal-s55-temari-5319-6",
  "contest-rehearsal-s55-temari-5319-7",
  "contest-rehearsal-s55-temari-5319-8",
  "contest-rehearsal-s55-temari-5319-9",
  "contest-rehearsal-s55-temari-5319-5",
  "contest-rehearsal-s55-temari-5613",
  "contest-rehearsal-s55-kotone-4866-2",
  "contest-rehearsal-s55-temari-5613-2",
  "contest-rehearsal-s55-temari-5613-3",
  "contest-rehearsal-s55-kotone-4866-3",
  "contest-rehearsal-s55-misuzu-rehearsal-20",
  "contest-rehearsal-s55-misuzu-rehearsal-21",
  "contest-rehearsal-s55-misuzu-rehearsal-22",
  "contest-rehearsal-s55-misuzu-rehearsal-23",
  "contest-rehearsal-s55-misuzu-rehearsal-24",
  "contest-rehearsal-s55-misuzu-rehearsal-25",
  "contest-rehearsal-s55-misuzu-rehearsal-27",
  "contest-rehearsal-s55-misuzu-rehearsal-30",
  "contest-rehearsal-s55-misuzu-rehearsal-31",
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
  const cardIds = new Set(
    play.actions.map((action) => action.cardId).filter((id) => id !== null),
  );
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

function playAction(engine, state, action, turn) {
  if (action.cardId === null) return engine.endTurn(state);

  assert.equal(SkillCards.getById(action.cardId).name, action.name);

  // Once-per-stage cards used twice come from two copies in the deck.
  const card = state[S.cardMap].findIndex(
    (c, i) => c.id == action.cardId && !state[S.removedCards].includes(i),
  );
  assert.ok(card >= 0, `${action.name} removed`);
  putInHand(state, card);
  assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
  return engine.useCard(state, card);
}

function replay(capture, play) {
  const engine = createEngine(capture, play);
  let state = engine.startStage(engine.getInitialState());
  engine.logger.disable();

  for (const [field, value] of Object.entries(capture.initial)) {
    assert.equal(state[S[field]], value, `initial ${field}`);
  }

  for (const [i, action] of play.actions.entries()) {
    // One action a turn unless the action names its turn.
    const turn = action.turn ?? i + 1;
    const next = play.actions[i + 1];
    const endsTurn = !next || (next.turn ?? i + 2) != turn;
    state = playAction(engine, state, action, turn);

    assert.equal(state[S.turnsElapsed], endsTurn ? turn : turn - 1);
    for (const [field, value] of Object.entries(action.expected)) {
      let actual = state[S[field]];
      if (field === "heldCards") {
        actual = actual.map((card) => state[S.cardMap][card].id);
      }
      assert.deepEqual(
        actual,
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
