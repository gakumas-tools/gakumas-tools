import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "gakumas-engine";
import ManualStrategy, {
  MoveToTopOfDeckSelectionRequest,
} from "../../../../packages/gakumas-engine/strategies/ManualStrategy.js";
import { createEngine } from "../helpers.mjs";

// Drive one decision the way StagePlayer does: run it, and on each
// selection request let the strategy prompt and replay.
async function play(strategy, engine, state, decision) {
  let exception;
  try {
    return engine.executeDecision(state, decision);
  } catch (error) {
    exception = error;
  }
  for (;;) {
    try {
      return await strategy.handleException(exception, state, decision);
    } catch (error) {
      if (!error.name?.endsWith("SelectionRequest")) throw error;
      exception = error;
    }
  }
}

test("manual play requests and consumes a top-of-deck selection", async () => {
  const state = [];
  const cards = [4, 7, 9];
  const decision = { card: 1 };
  let request;
  const engine = {
    executeDecision(receivedState, receivedDecision) {
      return {
        receivedState,
        receivedDecision,
        picked: strategy.pickCardsToMoveToTopOfDeck(state, cards, 2),
      };
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
  assert.deepEqual(resumed, {
    receivedState: state,
    receivedDecision: decision,
    picked: [1, 2],
  });
});

test("a card use with several selections asks each one once, in order", async () => {
  const prompts = [];
  const engine = {
    executeDecision() {
      return [
        strategy.pickCardsToUseFree([], [1, 2], 1),
        strategy.pickCardsToHold([], [3, 4], 1),
        strategy.pickCardsToHold([], [5, 6], 1),
      ];
    },
  };
  const strategy = new ManualStrategy(engine, async (request) => {
    prompts.push(`${request.type}:${request.cards}`);
    if (prompts.length > 6) throw new Error("too many prompts");
    return [prompts.length];
  });

  const result = await play(strategy, engine, [], { card: 0 });
  assert.deepEqual(prompts, [
    "USE_CARD_FREE_SELECTION:1,2",
    "HOLD_SELECTION:3,4",
    "HOLD_SELECTION:5,6",
  ]);
  assert.deepEqual(result, [[1], [2], [3]]);
});

test("先生でアイドル！ into 潜在能力 resolves after three prompts", async () => {
  // 789 doubles the next card's effect and uses a selected card for free;
  // 416 holds a selected card, so doubled it asks twice.
  const engine = createEngine({ skillCardIds: [789, 416, 19, 20, 21, 22] });
  let state = engine.startStage(engine.getInitialState());
  const idx = (id) => state[S.cardMap].findIndex((c) => c.id === id);
  const all = [...state[S.handCards], ...state[S.deckCards]];
  state[S.handCards] = [idx(789), idx(19), idx(20)];
  state[S.deckCards] = all.filter((c) => !state[S.handCards].includes(c));

  const prompts = [];
  const strategy = new ManualStrategy(engine, async (request) => {
    prompts.push(request.type);
    if (prompts.length > 6) throw new Error("too many prompts");
    if (request.type === "USE_CARD_FREE_SELECTION") {
      return [request.cards.indexOf(idx(416))];
    }
    return [0];
  });
  engine.strategy = strategy;

  state = await play(strategy, engine, state, { card: idx(789) });
  assert.deepEqual(prompts, [
    "USE_CARD_FREE_SELECTION",
    "HOLD_SELECTION",
    "HOLD_SELECTION",
  ]);
  assert.equal(state[S.heldCards].length, 2);
});
