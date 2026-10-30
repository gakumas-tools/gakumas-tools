import { test } from "node:test";
import assert from "node:assert/strict";
import ManualStrategy, {
  MoveToTopOfDeckSelectionRequest,
} from "../../../../packages/gakumas-engine/strategies/ManualStrategy.js";

test("manual play requests and consumes a top-of-deck selection", async () => {
  const state = [];
  const cards = [4, 7, 9];
  const decision = { card: 1 };
  let request;
  const engine = {
    executeDecision(receivedState, receivedDecision) {
      return { receivedState, receivedDecision };
    },
  };
  const strategy = new ManualStrategy(engine, async (pending) => {
    request = pending;
    return [1, 2];
  });

  let exception;
  try {
    strategy.pickCardsToMoveToTopOfDeck(state, cards, 2);
  } catch (error) {
    exception = error;
  }
  assert.ok(exception instanceof MoveToTopOfDeckSelectionRequest);

  const resumed = await strategy.handleException(exception, state, decision);
  assert.equal(request.type, "MOVE_TO_TOP_OF_DECK_SELECTION");
  assert.deepEqual(strategy.pickCardsToMoveToTopOfDeck(state, cards, 2), [1, 2]);
  assert.deepEqual(resumed, {
    receivedState: state,
    receivedDecision: decision,
  });
});
