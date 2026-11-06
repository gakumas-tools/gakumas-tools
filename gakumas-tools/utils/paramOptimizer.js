// One-click param redistribution for the simulator. Takes a finished
// simulation's scoreStats and finds the (vocal, dance, visual) allocation
// within the user's current total that maximizes expected score, assuming
// strategy/play is unchanged (only the type multipliers shift).

import { calculateTypeMultipliers, getParamCap } from "gakumas-engine";

function aggregateScoreByType(scoreStats) {
  const total = { vocal: 0, dance: 0, visual: 0 };
  if (!scoreStats?.turns) return total;
  for (const turn of scoreStats.turns) {
    if (!turn) continue;
    total.vocal += turn.totalScoreByType.vocal;
    total.dance += turn.totalScoreByType.dance;
    total.visual += turn.totalScoreByType.visual;
  }
  return total;
}

// Coordinate descent over decreasing step sizes. Each step moves one unit
// from one axis to another, preserving the total.
const STEP_SIZES = [100, 50, 10, 5, 3, 1];
const PAIRS = [
  ["vocal", "dance"],
  ["vocal", "visual"],
  ["dance", "visual"],
];

export function findOptimalParams({
  scoreStats,
  config,
  enterPercents = false,
}) {
  if (!scoreStats || !scoreStats.numRuns) return null;

  const { stage, idol } = config;
  const oldMult = config.typeMultipliers;
  const supportBonus = idol.supportBonus || 0;

  if (!oldMult.vocal || !oldMult.dance || !oldMult.visual) return null;

  const cur = idol.params;
  const total = cur.vocal + cur.dance + cur.visual;
  if (total <= 0) return null;

  const totalByType = aggregateScoreByType(scoreStats);
  // The season cap applies to raw contest params, not to percentages.
  const isRawContest = stage.type == "contest" && !enterPercents;
  const cap = isRawContest ? getParamCap(stage.season) : total;

  function score(params) {
    const mult = calculateTypeMultipliers(
      params,
      stage,
      supportBonus,
      enterPercents,
    );
    return (
      (totalByType.vocal * mult.vocal) / oldMult.vocal +
      (totalByType.dance * mult.dance) / oldMult.dance +
      (totalByType.visual * mult.visual) / oldMult.visual
    );
  }

  let best = { vocal: cur.vocal, dance: cur.dance, visual: cur.visual };
  let bestScore = score(best);

  for (const step of STEP_SIZES) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [a, b] of PAIRS) {
        for (const dir of [+1, -1]) {
          const candidate = { ...best };
          candidate[a] += step * dir;
          candidate[b] -= step * dir;
          if (
            candidate[a] < 0 ||
            candidate[b] < 0 ||
            candidate[a] > cap ||
            candidate[b] > cap
          ) {
            continue;
          }
          const candidateScore = score(candidate);
          if (candidateScore > bestScore) {
            best = candidate;
            bestScore = candidateScore;
            improved = true;
          }
        }
      }
    }
  }

  return {
    params: best,
    baseScore: score(cur),
    optimalScore: bestScore,
  };
}
