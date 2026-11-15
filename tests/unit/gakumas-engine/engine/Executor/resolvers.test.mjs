import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
import { createEngine, parseActions } from "../../helpers.mjs";

const NANIKA_GA_KAWARU_YOKAN_PLUS = 513;

function startedStage() {
  const engine = createEngine({ pItemIds: [NANIKA_GA_KAWARU_YOKAN_PLUS] });
  const state = engine.getInitialState();
  engine.startStage(state);
  return { engine, state };
}

test("なにかが変わる予感+ starts メタモルフォーゼ (支度) before its own gains", () => {
  const { state } = startedStage();
  assert.equal(state[S.metamorphosis], "metamorphosisPreparation");
  // 集中+1 and 好調1ターン each get +1 from 支度
  assert.equal(state[S.concentration], 2);
  assert.ok(state[S.goodConditionTurns] >= 2);
});

test("支度 adds 1 to increases of 集中, 好調 and 絶好調 and cuts score by 25%", () => {
  const { engine, state } = startedStage();
  const before = [S.concentration, S.goodConditionTurns, S.perfectConditionTurns].map(
    (f) => state[f],
  );
  engine.executor.executeActions(
    state,
    parseActions("concentration+=2; goodConditionTurns+=2; perfectConditionTurns+=2"),
    null,
  );
  assert.equal(state[S.concentration] - before[0], 3);
  assert.equal(state[S.goodConditionTurns] - before[1], 3);
  assert.equal(state[S.perfectConditionTurns] - before[2], 3);

  state[S.metamorphosis] = "none";
  state[S.concentration] = 0;
  state[S.goodConditionTurns] = 0;
  state[S.perfectConditionTurns] = 0;
  const s0 = state[S.score];
  engine.executor.executeActions(state, parseActions("score+=100"), null);
  const plain = state[S.score] - s0;

  state[S.metamorphosis] = "metamorphosisPreparation";
  const s1 = state[S.score];
  engine.executor.executeActions(state, parseActions("score+=100"), null);
  assert.equal(state[S.score] - s1, Math.ceil(plain * 0.75));

  state[S.metamorphosis] = "metamorphosisPerformance";
  const s2 = state[S.score];
  engine.executor.executeActions(state, parseActions("score+=100"), null);
  assert.equal(state[S.score] - s2, Math.ceil(plain * 1.25));
});

test("披露 takes 1 off increases and never touches decreases", () => {
  const { engine, state } = startedStage();
  state[S.metamorphosis] = "metamorphosisPerformance";
  state[S.concentration] = 5;
  engine.executor.executeActions(state, parseActions("concentration+=3"), null);
  assert.equal(state[S.concentration], 7);
  engine.executor.executeActions(state, parseActions("concentration-=2"), null);
  assert.equal(state[S.concentration], 5);
});

test("支度 becomes 披露 once the first half of the turns has ended", () => {
  const { engine, state } = startedStage();
  const turnCount = state[S.turnsRemaining];
  const half = Math.floor(turnCount / 2);
  for (let i = 0; i < half - 1; i++) engine.turnManager.endTurn(state);
  assert.equal(state[S.metamorphosis], "metamorphosisPreparation");
  engine.turnManager.endTurn(state);
  assert.equal(state[S.metamorphosis], "metamorphosisPerformance");
});

test("柔らかな光の中で+ scores now, 2 hits at next turn end, 3 hits two turns later", () => {
  const engine = createEngine({ skillCardIds: [924] });
  const state = engine.getInitialState();
  engine.startStage(state);
  const card = state[S.cardMap].findIndex((c) => c.id == 924);
  assert.ok(card >= 0, "card in the deck");
  if (!state[S.handCards].includes(card)) {
    engine.cardManager.moveCardToHand(state, card);
  }
  state[S.concentration] = 3;
  state[S.genki] = 100;
  assert.ok(engine.cardManager.isCardUsable(state, card));
  const s0 = state[S.score];
  engine.cardManager.useCard(state, card);
  assert.ok(state[S.score] > s0, "scores when used");
  const scores = [];
  for (let t = 0; t < 3; t++) {
    const s = state[S.score];
    engine.turnManager.endTurn(state);
    scores.push(state[S.score] - s);
  }
  assert.equal(scores[0], 0, "nothing at this turn's end");
  assert.ok(scores[1] > 0, "fires at the next turn's end");
  assert.ok(scores[2] > scores[1], "three hits two turns later");
});

test("柔らかな光の中で+ needs 集中 3 or more", () => {
  const engine = createEngine({ skillCardIds: [924] });
  const state = engine.getInitialState();
  engine.startStage(state);
  const card = state[S.cardMap].findIndex((c) => c.id == 924);
  state[S.concentration] = 2;
  assert.equal(engine.cardManager.isCardUsable(state, card), false);
});
