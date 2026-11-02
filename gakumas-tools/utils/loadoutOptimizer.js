import { PItems, SkillCards, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  STRATEGIES,
  StageConfig,
  StageEngine,
  StagePlayer,
  resetRand,
} from "gakumas-engine";

const MAX_LOADOUTS = 32;
const MAX_RUNS = 1000;
const MIN_VALIDATION_RUNS = 30;
const VO_DA_VI_ORDERS = [
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function paramTotal(loadout) {
  const [vocal, dance, visual] = loadout.params;
  return vocal + dance + visual;
}

// The other orders of the loadout's Vo/Da/Vi, without repeats, stamina kept.
export function paramLayouts(params) {
  const seen = new Set([params.join()]);
  const layouts = [];
  for (const order of VO_DA_VI_ORDERS) {
    const layout = [...order.map((i) => params[i]), params[3]];
    if (seen.has(layout.join())) continue;
    seen.add(layout.join());
    layouts.push(layout);
  }
  return layouts;
}

export function loadoutStageConfig(loadout, enterPercents) {
  const stage = Stages.getById(loadout.stageId);
  if (!["contest", "event"].includes(stage?.type)) {
    throw new Error(`Stage ${loadout.stageId} is not a contest or event stage`);
  }
  const unknownItem = loadout.pItemIds.find((id) => id && !PItems.getById(id));
  if (unknownItem) throw new Error(`Unknown P-item ${unknownItem}`);
  const unknownCard = loadout.skillCardIdGroups
    .flat()
    .find((id) => id && !SkillCards.getById(id));
  if (unknownCard) throw new Error(`Unknown skill card ${unknownCard}`);

  const idol = new IdolConfig(loadout);
  if (stage.plan != "free" && idol.plan && idol.plan != stage.plan) {
    throw new Error(`A ${idol.plan} idol can't play a ${stage.plan} stage`);
  }
  return new IdolStageConfig(idol, new StageConfig(stage), enterPercents);
}

export function createLoadoutEvaluator(enterPercents) {
  return async (loadout, seed) => {
    const engine = new StageEngine(loadoutStageConfig(loadout, enterPercents));
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;
    resetRand(seed);
    const { score } = await new StagePlayer(engine, strategy).play();
    return score;
  };
}

function checkOptions({
  baseline,
  candidates,
  runs,
  validationRuns,
  seed,
  minGain,
}) {
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new Error(`runs must be 1 to ${MAX_RUNS}`);
  }
  if (
    !Number.isInteger(validationRuns) ||
    validationRuns < MIN_VALIDATION_RUNS ||
    validationRuns > MAX_RUNS
  ) {
    throw new Error(
      `validationRuns must be ${MIN_VALIDATION_RUNS} to ${MAX_RUNS}`,
    );
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("seed must be a 32-bit unsigned integer");
  }
  if (!Number.isFinite(minGain) || minGain < 0) {
    throw new Error("minGain must be 0 or more");
  }
  if (candidates.length + 1 > MAX_LOADOUTS) {
    throw new Error(`Compare at most ${MAX_LOADOUTS} loadouts`);
  }

  const ids = new Set();
  for (const { id, loadout } of [baseline, ...candidates]) {
    if (ids.has(id)) throw new Error(`${id} is used by two loadouts`);
    ids.add(id);
    if (loadout.stageId != baseline.loadout.stageId) {
      throw new Error(`${id} is on a different stage`);
    }
    // Allow for float rounding in percentage inputs.
    if (Math.abs(paramTotal(loadout) - paramTotal(baseline.loadout)) > 1e-8) {
      throw new Error(`${id} has a different Vo/Da/Vi total`);
    }
  }
}

// Picks the best candidate on one set of seeds, then keeps it over the
// baseline only if it also wins on a fresh set, by more than minGain at the
// low end of a 95% interval. Picking on the same seeds would overrate it.
export async function compareLoadoutCandidates({
  baseline,
  candidates,
  evaluate,
  runs = 50,
  validationRuns = 200,
  seed = 610397104,
  minGain = 0,
}) {
  checkOptions({ baseline, candidates, runs, validationRuns, seed, minGain });

  async function score({ id, loadout }, trialSeed) {
    const value = await evaluate(loadout, trialSeed);
    if (!Number.isFinite(value)) {
      throw new Error(`${id} scored ${value} on seed ${trialSeed}`);
    }
    return value;
  }

  const selection = [];
  for (const entry of [baseline, ...candidates]) {
    const scores = [];
    for (let i = 0; i < runs; i++) {
      scores.push(await score(entry, (seed + i) >>> 0));
    }
    selection.push({ id: entry.id, mean: mean(scores) });
  }
  selection.sort((a, b) => b.mean - a.mean);

  const validationSeed = (seed + runs) >>> 0;
  const result = {
    selectedId: baseline.id,
    candidateId: selection[0].id,
    accepted: false,
    selection,
    validation: null,
    runs,
    validationRuns,
    seed,
    validationSeed,
    minGain,
  };
  if (result.candidateId == baseline.id) return result;

  const candidate = candidates.find(({ id }) => id == result.candidateId);
  const baselineScores = [];
  const candidateScores = [];
  for (let i = 0; i < validationRuns; i++) {
    const trialSeed = (validationSeed + i) >>> 0;
    baselineScores.push(await score(baseline, trialSeed));
    candidateScores.push(await score(candidate, trialSeed));
  }

  const gains = candidateScores.map((value, i) => value - baselineScores[i]);
  const meanGain = mean(gains);
  const variance =
    gains.reduce((a, gain) => a + (gain - meanGain) ** 2, 0) /
    (validationRuns - 1);
  const margin = 1.96 * Math.sqrt(variance / validationRuns);
  result.validation = {
    n: validationRuns,
    baselineMean: mean(baselineScores),
    candidateMean: mean(candidateScores),
    meanGain,
    margin,
    lowerGain: meanGain - margin,
    upperGain: meanGain + margin,
  };
  if (result.validation.lowerGain > minGain) {
    result.selectedId = candidate.id;
    result.accepted = true;
  }
  return result;
}
