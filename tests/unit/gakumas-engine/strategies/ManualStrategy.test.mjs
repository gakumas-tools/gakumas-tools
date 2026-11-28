import { test } from "node:test";
import assert from "node:assert/strict";
import { S, resetRand } from "gakumas-engine";
import ManualStrategy, {
  MoveToTopOfDeckSelectionRequest,
  setHand,
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

test("a prompt after a reshuffle holds the card it showed", async () => {
  // 789 uses 対戦お願いします！ (528) twice; with the deck empty, its draw
  // reshuffles the discards between the two hold prompts.
  for (let seed = 0; seed < 10; seed++) {
    resetRand(seed);
    const engine = createEngine({
      skillCardIds: [789, 528, 19, 20, 21, 22, 23, 24],
    });
    let state = engine.startStage(engine.getInitialState());
    const idx = (id) => state[S.cardMap].findIndex((c) => c.id === id);
    const rest = [
      ...state[S.handCards],
      ...state[S.deckCards],
      ...state[S.discardedCards],
    ].filter((c) => c !== idx(789) && c !== idx(528));
    state[S.handCards] = [idx(789), rest[0]];
    state[S.deckCards] = [idx(528)];
    state[S.discardedCards] = rest.slice(1);

    const shown = [];
    const strategy = new ManualStrategy(engine, async (request) => {
      if (request.type === "CARD_SELECTION") return idx(789);
      if (request.type === "USE_CARD_FREE_SELECTION") {
        return [request.cards.indexOf(idx(528))];
      }
      shown.push(request.cards[0]);
      return [0];
    });
    engine.strategy = strategy;

    state = await play(strategy, engine, state, await strategy.evaluate(state));
    assert.equal(shown.length, 2);
    assert.deepEqual([...state[S.heldCards]].sort(), [...shown].sort());
  }
});

// Plays `cardId` with a single card left in the deck and returns the
// selection request it raises.
function selectionRequest(cardId) {
  const engine = createEngine({
    skillCardIds: [cardId, 19, 20, 21],
    params: [100, 100, 100, 50],
  });
  const state = engine.startStage(engine.getInitialState());
  const card = state[S.cardMap].findIndex((c) => c.id === cardId);
  const others = [
    ...state[S.handCards],
    ...state[S.deckCards],
    ...state[S.discardedCards],
  ].filter((k) => k !== card);
  state[S.handCards] = [card, ...others.slice(0, 3)];
  state[S.deckCards] = others.slice(3, 4);
  state[S.discardedCards] = [];
  state[S.removedCards] = others.slice(4);
  state[S.fullPowerCharge] = 10;
  engine.strategy = new ManualStrategy(engine, async () => []);
  try {
    engine.executeDecision(state, { card });
  } catch (request) {
    return request;
  }
  assert.fail("no selection request");
}

test("a selection never asks for more cards than there are", () => {
  // あの日、この場所で+ (527): holdSelected[deck | discarded](2)
  const request = selectionRequest(527);
  assert.equal(request.cards.length, 1);
  assert.equal(request.num, 1);
  assert.equal(request.optional, false);
});

test("an Upto selection is optional", () => {
  // 本領発揮 (753): holdSelectedUpto[deck | discarded](2)
  const request = selectionRequest(753);
  assert.equal(request.num, 1);
  assert.equal(request.optional, true);
});

test("manual play offers the held P-drinks and passes a drink choice on", async () => {
  const state = [];
  let request;
  const engine = {
    logger: { log: () => ({}), getHandStateForLogging: () => ({}) },
    isCardUsable: () => true,
    getHeldPDrinks: () => [5, 18],
  };
  state[S.handCards] = [0];
  state[S.cardMap] = [{ id: 1 }];
  const strategy = new ManualStrategy(engine, async (pending) => {
    request = pending;
    return { pDrink: 1 };
  });
  const decision = await strategy.evaluate(state);
  assert.equal(request.type, "CARD_SELECTION");
  assert.deepEqual(request.pDrinks, [5, 18]);
  assert.deepEqual(decision, { pDrink: 1 });
});

function piles(hand, deck, discard) {
  const state = [];
  state[S.handCards] = hand;
  state[S.deckCards] = deck;
  state[S.discardedCards] = discard;
  state[S.removedCards] = [9];
  return state;
}

test("setting the hand swaps each chosen card with one the hand gives up", () => {
  // Deck top is the end of the array.
  const state = setHand(piles([0, 1, 2], [3, 4, 5], [6, 7]), [0, 4, 7]);
  assert.deepEqual(state[S.handCards], [0, 4, 7]);
  assert.deepEqual(state[S.deckCards], [3, 1, 5]);
  assert.deepEqual(state[S.discardedCards], [6, 2]);
  assert.deepEqual(state[S.removedCards], [9]);
});

test("a hand set bigger shrinks the piles, and one set smaller puts the rest under the deck", () => {
  const bigger = setHand(piles([0], [3, 4, 5], [6]), [0, 3, 5, 6]);
  assert.deepEqual(bigger[S.handCards], [0, 3, 5, 6]);
  assert.deepEqual(bigger[S.deckCards], [4]);
  assert.deepEqual(bigger[S.discardedCards], []);

  const smaller = setHand(piles([0, 1, 2], [3, 4], []), [4]);
  assert.deepEqual(smaller[S.handCards], [4]);
  assert.deepEqual(smaller[S.deckCards], [1, 2, 3, 0]);
});

test("manual play sets the hand it's given and asks again from it", async () => {
  const state = piles([0, 1], [2, 3], []);
  state[S.cardMap] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const requests = [];
  const engine = {
    logger: { log: () => ({}), getHandStateForLogging: () => ({}) },
    isCardUsable: () => true,
    getHeldPDrinks: () => [],
  };
  const answers = [{ setHand: [0, 3] }, 3];
  const strategy = new ManualStrategy(engine, async (pending) => {
    requests.push([...pending.handCards]);
    return answers.shift();
  });
  const decision = await strategy.evaluate(state);
  assert.deepEqual(requests, [[0, 1], [0, 3]]);
  assert.deepEqual(decision, { card: 3 });
  assert.deepEqual(state[S.deckCards], [2, 1]);
});
