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
  "idol-road-saki-s2",
  "idol-road-saki-s3",
  "idol-road-saki-s4",
  "idol-road-saki-s5",
  "idol-road-saki-s6",
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
function supplyHand(state, cardIds) {
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
    const hand = supplyHand(state, action.handCardIds);
    if (action.skip) {
      state = engine.endTurn(state);
    } else {
      // A turn with スキルカード使用数追加 plays more than one card from the
      // hand it was dealt.
      const plays = action.plays || [action];
      for (const [j, { cardId, name }] of plays.entries()) {
        assert.equal(SkillCards.getById(cardId).name, name);
        const card = state[S.handCards].find(
          (c) => state[S.cardMap][c].id == cardId,
        );
        assert.ok(engine.isCardUsable(state, card), `turn ${turn}: usable`);
        state = engine.useCard(state, card);
        if (j < plays.length - 1) {
          assert.equal(state[S.turnsElapsed], turn - 1, `turn ${turn}: extra play`);
        }
      }
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
