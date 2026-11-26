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
// Every option is played on the same `runsPerOption` seeds, so they're
// compared on the same draws. This reseeds the engine's random numbers;
// afterwards they're reseeded from a draw made before planning.
//
// Returns the planned turns (1-based, or null), one per drink slot. The
// engine's config is left as it was.
export default async function planPDrinkTurns(
  engine,
  strategy,
  { runsPerOption = 16 } = {},
) {
  const { idol, stage } = engine.config;
  const original = idol.pDrinkTurns || [];
  const plan = idol.pDrinkIds.map((_, slot) => original[slot] || null);
  const auto = plan.flatMap((turn, slot) => (turn == null ? [slot] : []));
  if (!auto.length) return plan;

  const seed = Math.floor(getRand() * 2 ** 32);
  const logger = engine.logger;
  async function meanScore(turns) {
    idol.pDrinkTurns = turns;
    let total = 0;
    for (let r = 0; r < runsPerOption; r++) {
      resetRand(seed + r + 1);
      total += (await new StagePlayer(engine, strategy).play()).score;
    }
    return total / runsPerOption;
  }

  try {
    for (const slot of auto) {
      let best = null;
      for (let turn = 0; turn <= stage.turnCount; turn++) {
        const option = turn || null;
        const turns = plan.slice();
        turns[slot] = option;
        const score = await meanScore(turns);
        if (!best || score > best.score) best = { option, score };
      }
      plan[slot] = best.option;
    }
  } finally {
    idol.pDrinkTurns = original;
    logger.reset();
    resetRand(seed);
  }
  return plan;
}
