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
    });

    // Selection prompts replay this use with the draws it made.
    recordRand();
    return { card: selectedCard };
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
