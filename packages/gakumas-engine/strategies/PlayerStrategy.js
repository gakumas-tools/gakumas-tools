export default class PlayerStrategy {
  constructor(engine) {
    this.engine = engine;
    this.pickCardsToHoldIndices = [];
  }

  /**
   * Evaluates the given state, and selects a card to play.
   * Returns the next state and numeric evaluation of the future state.
   */
  evaluate(state) {
    throw new Error("evaluate is not implemented!");
  }

  /**
   * Given a state and list of cards, selects a card to hold.
   * Returns the indices of the cards to hold.
   */
  pickCardsToHold(state, cards, num = 1, optional = false) {
    if (this.pickCardsToHoldIndices.length > 0) {
      return this.pickCardsToHoldIndices.shift();
    } else {
      const e = new Error("not picked");
      e.args = {state, cards, num, optional};
      throw e;
    }
  }

  pickCardsToMoveToHand(state, cards, num = 1, optional = false) {
    return this.pickCardsToHold(state, cards, num, optional);
  }

  pickCardsToMoveToTopOfDeck(state, cards, num = 1, optional = false) {
    return this.pickCardsToHold(state, cards, num, optional);
  }

  pickCardsToCopy(state, cards, num = 1, optional = false) {
    return this.pickCardsToHold(state, cards, num, optional);
  }

  pickCardsToUseFree(state, cards, num = 1) {
    return this.pickCardsToHold(state, cards, num);
  }

  pickRandomCard(state, cards, isRawId = false) {
    if (cards.length === 0) return 0;
    if (isRawId) {
      if (this.pickCardsToHoldIndices.length > 0) {
        return this.pickCardsToHoldIndices.shift()[0];
      } else {
        const e = new Error("not picked");
        e.args = {state, cards, num: 1, optional: false, isRawId: true};
        throw e;
      }
    } else {
      return this.pickCardsToHold(state, cards, 1)[0];
    }
  }
}
