export default class BaseStrategy {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Evaluates the given state, and selects a card to play.
   * Returns the next state and numeric evaluation of the future state.
   * Can be async for strategies that need to await user input (ManualStrategy).
   */
  evaluate(state) {
    throw new Error("evaluate is not implemented!");
  }

  /**
   * Given a state and list of cards, selects a card to move to hand.
   * Returns the indices of the cards to move.
   * Can be async for strategies that need to await user input (ManualStrategy).
   */
  pickCardsToMoveToHand(state, cards, num = 1) {
    throw new Error("pickCardsToMoveToHand is not implemented!");
  }

  /**
   * Given a state and list of cards, selects cards to move to the top of deck.
   * Returns the indices of the cards to move.
   * Can be async for strategies that need to await user input (ManualStrategy).
   */
  pickCardsToMoveToTopOfDeck(state, cards, num = 1) {
    throw new Error("pickCardsToMoveToTopOfDeck is not implemented!");
  }

  /**
   * Given a state and list of cards, selects a card to hold.
   * Returns the indices of the cards to hold.
   * Can be async for strategies that need to await user input (ManualStrategy).
   */
  pickCardsToHold(state, cards, num = 1) {
    throw new Error("pickCardsToHold is not implemented!");
  }

  /**
   * Given a state and list of cards, selects a card to use for free.
   * Returns the indices of the cards to use.
   * Can be async for strategies that need to await user input (ManualStrategy).
   */
  pickCardsToUseFree(state, cards, num = 1) {
    throw new Error("pickCardsToUseFree is not implemented!");
  }

  /**
   * Handles exceptions that occur while executing a decision.
   * Returns the next state.
   * Can be async for strategies that need to await user input.
   * Rethrowing the exception ends the stage with it; throwing another one
   * hands that one back to this handler.
   */
  handleException(exception) {
    throw exception;
  }
}
