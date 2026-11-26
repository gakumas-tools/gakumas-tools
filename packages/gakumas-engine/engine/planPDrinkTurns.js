import StagePlayer from "./StagePlayer";
import { getRand, resetRand } from "../utils";

// Picks the turn to drink each P-drink that has none set (pDrinkTurns null),
// the way a player would: by playing the stage with the drink set for each
// turn in turn, and keeping the turn that scores best on average. The
// strategy still picks the moment within the turn (before or after which
// card). Drinks are planned one at a time, in slot order, with the ones
// before them already planned; leaving a drink to the strategy's own timing
// (null) is one of the options.
//
// Every option is played on the same seeds, so they're compared on the same
// draws. `scoreOptions(options, seed)` can score them elsewhere (the
// simulator splits them across its workers); by default they're played here
// with scorePDrinkTurns.
//
// Returns the planned turns (1-based, or null), one per drink slot. The
// engine's config is left as it was.
export default async function planPDrinkTurns(
  engine,
  strategy,
  { runsPerOption = 16, scoreOptions } = {},
) {
  const { idol, stage } = engine.config;
  const original = idol.pDrinkTurns || [];
  const plan = idol.pDrinkIds.map((_, slot) => original[slot] || null);
  const auto = plan.flatMap((turn, slot) => (turn == null ? [slot] : []));
  if (!auto.length) return plan;

  const seed = Math.floor(getRand() * 2 ** 32);
  const score =
    scoreOptions ||
    ((options) =>
      scorePDrinkTurns(engine, strategy, options, { seed, runsPerOption }));

  for (const slot of auto) {
    const options = Array.from({ length: stage.turnCount + 1 }, (_, turn) => {
      const turns = plan.slice();
      turns[slot] = turn || null;
      return turns;
    });
    const scores = await score(options, seed);
    let best = 0;
    scores.forEach((s, i) => {
      if (s > scores[best]) best = i;
    });
    plan[slot] = options[best][slot];
  }
  return plan;
}

// The mean score of each option (a pDrinkTurns array), each played on seeds
// seed + 1 .. seed + runsPerOption. Reseeds the engine's random numbers
// afterwards from a draw made before scoring, so engines that score the same
// options (one per worker) don't go on with the same draws. The engine's
// config is left as it was.
export async function scorePDrinkTurns(
  engine,
  strategy,
  options,
  { seed, runsPerOption = 16 },
) {
  const { idol } = engine.config;
  const original = idol.pDrinkTurns;
  const after = Math.floor(getRand() * 2 ** 32);
  try {
    const scores = [];
    for (const turns of options) {
      idol.pDrinkTurns = turns;
      let total = 0;
      for (let r = 0; r < runsPerOption; r++) {
        resetRand(seed + r + 1);
        total += (await new StagePlayer(engine, strategy).play()).score;
      }
      scores.push(total / runsPerOption);
    }
    return scores;
  } finally {
    idol.pDrinkTurns = original;
    engine.logger.reset();
    resetRand(after);
  }
}
