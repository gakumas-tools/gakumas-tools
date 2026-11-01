import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

test("nested phase triggers restore the outer phase and parent phase", () => {
  // 721 スーパーノヴァ: at:cardMovedToHand { if:movedCardId==721 { drawCard } }
  // re-enters cardMovedToHand when it is drawn at the start of a turn.
  const engine = createEngine({ params: [1000, 1000, 1000, 50], skillCardIds: [721] });
  const state = engine.getInitialState();
  const card = state[S.cardMap].findIndex((c) => c.id === 721);
  state[S.deckCards] = [...state[S.deckCards].filter((c) => c !== card), card];
  engine.startStage(state);

  assert.ok(state[S.handCards].includes(card));
  assert.equal(state[S.phase], undefined);
  assert.equal(state[S.parentPhase], undefined);
});
