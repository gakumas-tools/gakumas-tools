import { PIdols } from "gakumas-data";
import { setMemorySlot } from "@/utils/memorySlots";

// The simulator's loadout for a main and a sub memory, as loading them into
// the two memory slots builds it: the main memory brings its P-items and full
// params, the sub memory its cards and a fifth of its params (all of them in a
// link contest).
export function memoryPairLoadout(stage, main, sub, supportBonus = 0) {
  let applied = { params: [0, 0, 0, 0], slots: [null, null] };
  [main, sub].forEach((memory, index) => {
    const multiplier = stage.type !== "linkContest" && index ? 0.2 : 1;
    applied = setMemorySlot(applied, index, memory.params, multiplier);
  });
  return {
    stageId: stage.id,
    supportBonus,
    params: applied.params,
    pItemIds: [0, 1, 2, 3].map((i) => main.pItemIds[i] || 0),
    skillCardIdGroups: [main.skillCardIds, sub.skillCardIds],
    customizationGroups: [
      main.customizations || main.skillCardIds.map(() => ({})),
      sub.customizations || sub.skillCardIds.map(() => ({})),
    ],
  };
}

// Whether the memory picker offers this memory for the stage: a stage with a
// plan lists only that plan's memories.
export function memoryFitsStage(stage, memory) {
  if (stage.plan == "free") return true;
  return PIdols.getById(memory.pIdolId)?.plan == stage.plan;
}

// Every ordered pair of two different memories the stage takes: a memory is
// used once.
export function memoryPairs(stage, memories) {
  const pairs = [];
  memories.forEach((main, i) => {
    memories.forEach((sub, j) => {
      if (
        i !== j &&
        memoryFitsStage(stage, main) &&
        memoryFitsStage(stage, sub)
      ) {
        pairs.push([i, j]);
      }
    });
  });
  return pairs;
}

const sum = (values) => values.reduce((a, b) => a + b, 0);

export function mean(values) {
  return sum(values) / values.length;
}

// Mean paired gain of candidate over baseline with an approximate 95% margin
// (normal approximation of the mean's sampling error).
export function pairedGain(baselineScores, candidateScores) {
  const gains = candidateScores.map((score, i) => score - baselineScores[i]);
  const average = mean(gains);
  const variance =
    gains.length > 1
      ? sum(gains.map((g) => (g - average) ** 2)) / (gains.length - 1)
      : 0;
  const margin = 1.96 * Math.sqrt(variance / gains.length);
  return { gain: average, margin, lower: average - margin };
}

// Ranks every pair on the selection seeds, then plays the best one and the
// baseline on validation seeds no pair was selected on. The best pair is only
// recommended when its held-out gain's lower bound is above zero.
export async function rankMemoryPairs({
  stage,
  memories,
  baseline,
  supportBonus = 0,
  selectionSeeds,
  validationSeeds,
  score,
}) {
  if (selectionSeeds.some((seed) => validationSeeds.includes(seed))) {
    throw new Error("Selection and validation seeds must not overlap");
  }
  const pairs = memoryPairs(stage, memories);
  if (!pairs.some(([main, sub]) => main == baseline[0] && sub == baseline[1])) {
    throw new Error("The baseline must be a pair the stage takes");
  }
  const play = async (pair, seeds) => {
    const loadout = memoryPairLoadout(
      stage,
      memories[pair[0]],
      memories[pair[1]],
      supportBonus,
    );
    const scores = [];
    for (const seed of seeds) scores.push(await score(loadout, seed));
    return scores;
  };

  const ranked = [];
  for (const pair of pairs) {
    const scores = await play(pair, selectionSeeds);
    ranked.push({ pair, mean: mean(scores) });
  }
  ranked.sort((a, b) => b.mean - a.mean);

  const best = ranked[0];
  const sameAsBaseline =
    best.pair[0] === baseline[0] && best.pair[1] === baseline[1];
  const baselineScores = await play(baseline, validationSeeds);
  const bestScores = sameAsBaseline
    ? baselineScores
    : await play(best.pair, validationSeeds);
  const validation = {
    baseline: mean(baselineScores),
    best: mean(bestScores),
    ...pairedGain(baselineScores, bestScores),
  };
  return {
    ranked,
    validation,
    recommended: !sameAsBaseline && validation.lower > 0 ? best.pair : baseline,
  };
}
