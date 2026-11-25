import assert from "node:assert/strict";
import { test } from "node:test";
import { IdolRoad, PIdols, SkillCards, Stages } from "gakumas-data";
import { IdolConfig, StageConfig, StageEngine, S } from "gakumas-engine";
import { hasIngameFixtures, loadIngameFixture } from "./ingameFixtures.mjs";

// Idol Road plays captured in game, replayed through the stage as the
// simulator builds it: the stages.csv row, resolved for the P-idol by
// IdolRoad (its idol's criteria and turn counts, its おすすめ効果's 応援/
// トラブル). The game's turn order and the hands it dealt are supplied, so
// only the stage data and the engine decide the numbers.
const FIXTURES = [
  "idol-road-saki-s1",
  "idol-road-saki-fmw-s1",
  "idol-road-saki-fmw-s4",
  "idol-road-saki-fmw-s5",
  "idol-road-saki-fmw-s2",
  "idol-road-saki-fmw-s9",
  "idol-road-saki-fmw-s10",
  "idol-road-saki-fmw-s6",
  "idol-road-saki-fmw-s7",
  "idol-road-saki-fmw-s8",
  "idol-road-saki-s2",
  "idol-road-saki-s3",
  "idol-road-saki-s4",
  "idol-road-saki-s5",
  "idol-road-saki-s6",
  "idol-road-saki-s7",
  "idol-road-saki-s8",
  "idol-road-saki-s8-clear",
  "idol-road-saki-s9",
  "idol-road-saki-s9-t9",
  "idol-road-saki-fmw-s1-3760",
  "idol-road-saki-fmw-s2-2188",
  "idol-road-saki-fmw-s3-2882",
  "idol-road-saki-fmw-s4-4268",
  "idol-road-saki-fmw-s5-2842",
  "idol-road-saki-fmw-s7-1214",
  "idol-road-saki-fmw-s8-1132",
  "idol-road-saki-fmw-s9-462",
  "idol-road-saki-fmw-s10-1787",
  "idol-road-saki-s1-15392",
  "idol-road-saki-s2-6672",
  "idol-road-saki-s3-10393",
  "idol-road-saki-s10-6282",
  "idol-road-saki-s4-11032",
  "idol-road-saki-s5-8350",
  "idol-road-saki-s6-5854",
  "idol-road-saki-s7-2263",
  "idol-road-saki-s3-5689",
  "idol-road-saki-fmw-s3-2460",
  "idol-road-saki-s10",
];

function createEngine(capture) {
  const pIdol = PIdols.getById(capture.pIdolId);
  const stage = IdolRoad.resolveStage(
    Stages.getById(capture.stageId),
    capture.pIdolId,
  );
  assert.equal(stage.type, "idolRoad");
  assert.equal(stage.plan, pIdol.plan);

  // The stage's turn counts are the ones the game dealt. Turns added during
  // the stage (ターン追加) come after them and take the last turn's type.
  const counts = { vocal: 0, dance: 0, visual: 0 };
  const turnCount = Object.values(stage.turnCounts).reduce((a, b) => a + b);
  for (const type of capture.turnTypes.slice(0, turnCount)) counts[type]++;
  for (const type of capture.turnTypes.slice(turnCount)) {
    assert.equal(type, capture.turnTypes[turnCount - 1], "added turn type");
  }
  assert.deepEqual(stage.turnCounts, counts, "turn counts");

  const typeMultipliers = {};
  for (const [type, percent] of Object.entries(capture.displayedPercents)) {
    typeMultipliers[type] = percent / 100;
  }
  const idol = new IdolConfig({
    params: [0, 0, 0, capture.initial.stamina],
    pItemIds: capture.pItemIds,
    skillCardIdGroups: [capture.deckCardIds],
  });
  const engine = new StageEngine({
    idol,
    defaultCardIds: [],
    typeMultipliers,
    stage: new StageConfig(stage),
  });
  engine.turnManager.generateTurnTypes = () => [...capture.turnTypes];
  return engine;
}

// The hand the game dealt, by card id: a copy that is not removed or held.
// The engine must have dealt as many cards as the game did (応援 draws,
// 手札減少); the ones it dealt that the game didn't go back to the deck.
function supplyHand(state, cardIds, turn) {
  const dealt = state[S.handCards];
  assert.equal(dealt.length, cardIds.length, `turn ${turn}: cards dealt`);
  const hand = [];
  for (const cardId of cardIds) {
    const card = state[S.cardMap].findIndex(
      (c, index) =>
        c.id == cardId &&
        !state[S.removedCards].includes(index) &&
        !state[S.heldCards].includes(index) &&
        !hand.includes(index),
    );
    assert.ok(card >= 0, `no copy of card ${cardId} left`);
    hand.push(card);
  }
  for (const pile of [S.handCards, S.deckCards, S.discardedCards]) {
    state[pile] = state[pile].filter((c) => !hand.includes(c));
  }
  state[S.deckCards].push(...dealt.filter((c) => !hand.includes(c)));
  state[S.handCards] = hand;
  return hand;
}

function replay(capture, play) {
  const engine = createEngine(capture);
  let state = engine.startStage(engine.getInitialState());
  engine.logger.disable();
  for (const [field, value] of Object.entries(capture.initial)) {
    assert.equal(state[S[field]], value, `initial ${field}`);
  }

  for (const [i, action] of play.actions.entries()) {
    const turn = i + 1;
    const hand = supplyHand(state, action.handCardIds, turn);
    // A turn with スキルカード使用数追加 plays more than one card from the
    // hand it was dealt. One that skips plays its cards first, if any, then
    // ends the turn with a play left (スキルカード未使用).
    const plays = action.plays || (action.skip ? [] : [action]);
    for (const [j, { cardId, name }] of plays.entries()) {
      assert.equal(SkillCards.getById(cardId).name, name);
      const card = state[S.handCards].find(
        (c) => state[S.cardMap][c].id == cardId,
      );
      assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
      state = engine.useCard(state, card);
      if (j < plays.length - 1 || action.skip) {
        assert.equal(state[S.turnsElapsed], turn - 1, `turn ${turn}: extra play`);
      }
    }
    if (action.skip) {
      state = engine.endTurn(state);
    }
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

for (const capture of hasIngameFixtures ? FIXTURES.map(loadIngameFixture) : []) {
  for (const play of capture.plays) {
    test(`in-game ${capture.stage}: ${play.id}`, () => replay(capture, play));
  }
}
