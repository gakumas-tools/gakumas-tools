import { StageEngine, STRATEGIES, S, resetRand } from "gakumas-engine";
// The engine's own random stream, so a seed fixes the reshuffle too.
import { getRand as nextRand } from "gakumas-engine/utils";

export const DEFAULT_PLAYOUTS = 200;

/**
 * What the simulator would expect from each play open to the player now:
 * every usable card in hand, and ending the turn. Each play is followed by
 * `playouts` runs of HeuristicStrategy to the end of the stage, on a deck
 * reshuffled per run (the player doesn't know the deck order). Run p of every
 * play draws from the same seed, so the plays are compared on the same luck.
 *
 * Returns { plays: [{ card, mean, min, max }], best } where card is the hand
 * card's index in the state (null = end the turn) and best is the play with
 * the highest mean. Copies of the same card (the same cardMap entry, which
 * holds its id, customizations and growth) are played out once and share one
 * expectation, so they never show different numbers. Reads nothing but its arguments; it reseeds the engine's
 * random stream at the end, so later draws stay unpredictable.
 */
export function suggestPlays(
  config,
  linkConfigs,
  state,
  { playouts = DEFAULT_PLAYOUTS, seed = 1 } = {},
) {
  const engine = new StageEngine(config, linkConfigs);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  engine.logger.disable();

  const options = state[S.handCards]
    .filter((card) => engine.isCardUsable(state, card))
    .concat([null]);

  const byEntry = new Map();
  const expect = (card) => {
    const key = card == null ? null : JSON.stringify(state[S.cardMap][card]);
    if (!byEntry.has(key)) byEntry.set(key, playOut(card));
    return { card, ...byEntry.get(key) };
  };
  const playOut = (card) => {
    let total = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let p = 0; p < playouts; p++) {
      resetRand(seed + p);
      let s = state.slice();
      s[S.deckCards] = [...state[S.deckCards]];
      s = shuffleDeck(s);
      s = card == null ? engine.endTurn(s) : engine.useCard(s, card);
      while (s[S.turnsRemaining] > 0) s = strategy.evaluate(s).state;
      total += s[S.score];
      min = Math.min(min, s[S.score]);
      max = Math.max(max, s[S.score]);
    }
    return { mean: total / playouts, min, max };
  };

  try {
    const plays = options.map(expect);
    const best = plays.reduce((a, b) => (b.mean > a.mean ? b : a));
    return { plays, best };
  } finally {
    resetRand(Math.floor(Math.random() * 2 ** 32));
  }
}

function shuffleDeck(state) {
  const deck = state[S.deckCards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return state;
}
