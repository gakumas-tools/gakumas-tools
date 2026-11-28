import { S } from "../constants";
import { recordRand, rewindRand, stopRecordingRand } from "../utils";
import BaseStrategy from "./BaseStrategy";

export class HoldSelectionRequest extends Error {
  constructor(state, cards, num, optional = false) {
    super("Hold selection required");
    this.name = "HoldSelectionRequest";
    this.state = state;
    this.cards = cards;
    this.num = num;
    // Whether fewer than `num` cards (even none) may be picked.
    this.optional = optional;
  }
}

export class MoveToHandSelectionRequest extends Error {
  constructor(state, cards, num) {
    super("Move to hand selection required");
    this.name = "MoveToHandSelectionRequest";
    this.state = state;
    this.cards = cards;
    this.num = num;
  }
}

export class MoveToTopOfDeckSelectionRequest extends Error {
  constructor(state, cards, num) {
    super("Move to top of deck selection required");
    this.name = "MoveToTopOfDeckSelectionRequest";
    this.state = state;
    this.cards = cards;
    this.num = num;
  }
}

export class UseCardFreeSelectionRequest extends Error {
  constructor(state, cards, num) {
    super("Use card free selection required");
    this.name = "UseCardFreeSelectionRequest";
    this.state = state;
    this.cards = cards;
    this.num = num;
  }
}

const REQUEST_TYPES = [
  [HoldSelectionRequest, "HOLD_SELECTION"],
  [MoveToHandSelectionRequest, "MOVE_TO_HAND_SELECTION"],
  [MoveToTopOfDeckSelectionRequest, "MOVE_TO_TOP_OF_DECK_SELECTION"],
  [UseCardFreeSelectionRequest, "USE_CARD_FREE_SELECTION"],
];

export default class ManualStrategy extends BaseStrategy {
  constructor(engine, inputCallback) {
    super(engine);
    this.inputCallback = inputCallback;
    this.answers = [];
    this.answerCursor = 0;
  }

  async evaluate(state) {
    stopRecordingRand();
    this.answers = [];
    this.answerCursor = 0;
    const handLog = this.engine.logger.log(state, "hand", null);

    while (true) {
      const usableCards = state[S.handCards].filter((card) =>
        this.engine.isCardUsable(state, card)
      );

      handLog.data = {
        handCards: state[S.handCards].map((card) => ({
          id: state[S.cardMap][card].id,
          c: state[S.cardMap][card].c11n,
        })),
        scores: state[S.handCards].map((card) =>
          usableCards.includes(card) ? 0 : -Infinity
        ),
        selectedIndex: null,
        state: this.engine.logger.getHandStateForLogging(state),
      };

      const selectedCard = await this.inputCallback({
        type: "CARD_SELECTION",
        state,
        handCards: state[S.handCards],
        usableCards,
        pDrinks: this.engine.getHeldPDrinks(state),
      });

      // The player may set the hand to the one the game shows:
      // { setHand: [card, ...] }, then choose again from it.
      if (selectedCard?.setHand) {
        setHand(state, selectedCard.setHand);
        continue;
      }

      // Selection prompts replay this use with the draws it made.
      recordRand();
      // The player may drink a held P-drink instead: { pDrink: index }.
      if (selectedCard?.pDrink != null) return { pDrink: selectedCard.pDrink };
      return { card: selectedCard };
    }
  }

  // Answers to this card use's selection prompts, in the order the use asks
  // them. A prompt aborts the use; once it's answered, the use replays from
  // the start and earlier prompts take their answers from here.
  nextAnswer(RequestType, state, cards, num, optional) {
    if (this.answerCursor < this.answers.length) {
      return this.answers[this.answerCursor++];
    }
    throw new RequestType(state, cards, num, optional);
  }

  pickCardsToMoveToHand(state, cards, num = 1) {
    return this.nextAnswer(MoveToHandSelectionRequest, state, cards, num);
  }

  pickCardsToMoveToTopOfDeck(state, cards, num = 1) {
    return this.nextAnswer(MoveToTopOfDeckSelectionRequest, state, cards, num);
  }

  pickCardsToHold(state, cards, num = 1, optional = false) {
    return this.nextAnswer(HoldSelectionRequest, state, cards, num, optional);
  }

  pickCardsToUseFree(state, cards, num = 1) {
    return this.nextAnswer(UseCardFreeSelectionRequest, state, cards, num);
  }

  async handleException(exception, state, decision) {
    const type = REQUEST_TYPES.find(
      ([RequestType]) => exception instanceof RequestType,
    )?.[1];
    if (!type) throw exception;

    const selectedIndices = await this.inputCallback({
      type,
      state: exception.state,
      cards: exception.cards,
      num: exception.num,
      optional: !!exception.optional,
    });
    this.answers.push(selectedIndices);

    this.answerCursor = 0;
    rewindRand();
    const nextState = this.engine.executeDecision(state, decision);
    stopRecordingRand();
    this.answers = [];
    this.answerCursor = 0;
    return nextState;
  }
}

// The cards a hand may be set from: the hand, the deck and the discard pile.
export const SET_HAND_PILES = [S.handCards, S.deckCards, S.discardedCards];

/**
 * Makes `cards` the hand, in place, as when the game's hand differs from the
 * simulator's draws. Each chosen card leaves the hand, deck or discard pile it
 * was in; each card that was in hand and isn't chosen takes the place a chosen
 * card left in the deck or discard pile, and any left over go to the bottom of
 * the deck. Nothing else in the state changes, and no random draw is made.
 */
export function setHand(state, cards) {
  const chosen = new Set(cards);
  const displaced = state[S.handCards].filter((card) => !chosen.has(card));
  for (const pile of [S.deckCards, S.discardedCards]) {
    state[pile] = state[pile]
      .map((card) => (chosen.has(card) ? displaced.shift() : card))
      .filter((card) => card != null);
  }
  state[S.deckCards] = [...displaced, ...state[S.deckCards]];
  state[S.handCards] = [...cards];
  return state;
}
