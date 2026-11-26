import { buildBoxPlotData } from "@/components/Rehearsal/rehearsalStats";

export const NUM_STAGES = 3;
export const NUM_SLOTS = 3;
const MAX_REHEARSAL_SCORES = 500;
const MAX_SCORE = 10_000_000;

export function rehearsalGrid(rows) {
  const bySlot = buildBoxPlotData(rows);
  return Array.from({ length: NUM_STAGES }, (_, stage) =>
    Array.from({ length: NUM_SLOTS }, (_, slot) => bySlot[slot].data[stage]),
  );
}

export function cellScores(rows, stage, slot) {
  return rehearsalGrid(rows)[stage][slot];
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function compareScores(simScores, rehearsalScores) {
  const n = rehearsalScores.length;
  if (!simScores.length || !n) return null;
  const simMean = mean(simScores);
  const rehearsalMean = mean(rehearsalScores);
  const diffPct = (simMean - rehearsalMean) / rehearsalMean;
  let marginPct = null;
  if (n >= 2) {
    const variance =
      rehearsalScores.reduce((a, s) => a + (s - rehearsalMean) ** 2, 0) /
      (n - 1);
    marginPct = (1.96 * Math.sqrt(variance / n)) / rehearsalMean;
  }
  return { n, simMean, rehearsalMean, diffPct, marginPct };
}

const SIM_STAT_FIELDS = [
  "count",
  "min",
  "q1",
  "median",
  "mean",
  "q3",
  "max",
  "stddev",
  "bucketMin",
  "bucketSize",
];
const MAX_BUCKETS = 100;

function cleanSimStats(stats) {
  if (!stats) return null;
  const clean = {};
  for (const field of SIM_STAT_FIELDS) {
    if (!Number.isFinite(stats[field])) return null;
    clean[field] = stats[field];
  }
  const { buckets } = stats;
  if (
    !Array.isArray(buckets) ||
    buckets.length > MAX_BUCKETS ||
    !buckets.every(Number.isInteger)
  ) {
    return null;
  }
  return { ...clean, buckets };
}

const isScore = (s) => Number.isInteger(s) && s > 0 && s < MAX_SCORE;
const isCell = (scores) =>
  Array.isArray(scores) &&
  scores.length <= MAX_REHEARSAL_SCORES &&
  scores.every(isScore);
const isGrid = (grid) =>
  Array.isArray(grid) &&
  grid.length == NUM_STAGES &&
  grid.every(
    (row) => Array.isArray(row) && row.length == NUM_SLOTS && row.every(isCell),
  );
const MAX_PARAMS = 4;
const MAX_IDS = 20;
const MAX_GROUPS = 10;

const isList = (value, max, isEntry) =>
  Array.isArray(value) && value.length <= max && value.every(isEntry);
const isOptionalNumber = (n) => n == null || Number.isFinite(n);
const isOptionalId = (n) => n == null || Number.isInteger(n);
const isCustomization = (c) =>
  c == null ||
  (typeof c == "object" &&
    Object.keys(c).length <= MAX_IDS &&
    Object.entries(c).every(
      ([id, level]) => /^\d{1,6}$/.test(id) && Number.isFinite(level),
    ));

function cleanLoadout(loadout) {
  const {
    stageId,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  } = loadout;
  if (
    !isOptionalNumber(supportBonus) ||
    !isList(params, MAX_PARAMS, isOptionalNumber) ||
    !isList(pItemIds, MAX_IDS, isOptionalId) ||
    !isList(skillCardIdGroups, MAX_GROUPS, (g) =>
      isList(g, MAX_IDS, isOptionalId),
    ) ||
    (customizationGroups != null &&
      !isList(customizationGroups, MAX_GROUPS, (g) =>
        isList(g, MAX_IDS, isCustomization),
      ))
  ) {
    return null;
  }
  return {
    stageId,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  };
}

const isId = (s) => typeof s == "string" && /^[0-9a-f-]{36}$/.test(s);

export function validateComparison(body) {
  const { id, loadout, enterPercents, simStats, rehearsal } = body || {};
  if (!isId(id)) return { error: "Invalid id" };
  if (!Number.isInteger(loadout?.stageId)) return { error: "Invalid stage" };
  const cleanedLoadout = cleanLoadout(loadout);
  if (!cleanedLoadout) return { error: "Invalid loadout" };
  const { stage, slot, grid } = rehearsal || {};
  if (
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > NUM_STAGES ||
    !Number.isInteger(slot) ||
    slot < 1 ||
    slot > NUM_SLOTS ||
    !isGrid(grid) ||
    !grid[stage - 1][slot - 1].length
  ) {
    return { error: "Invalid rehearsal" };
  }
  const cleanStats = cleanSimStats(simStats);
  if (!cleanStats) return { error: "Invalid simulator result" };
  return {
    comparison: {
      _id: id,
      loadout: cleanedLoadout,
      enterPercents: !!enterPercents,
      simStats: cleanStats,
      rehearsal: { stage, slot, scores: grid[stage - 1][slot - 1], grid },
    },
  };
}

const TARGET_BUCKETS = 20;

function niceStep(raw) {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
}

export function bucketShares(groups) {
  let min = Infinity;
  let max = -Infinity;
  for (const scores of groups) {
    for (const s of scores) {
      if (s < min) min = s;
      if (s > max) max = s;
    }
  }
  const bucketSize = niceStep(Math.max((max - min) / TARGET_BUCKETS, 1));
  const start = Math.floor(min / bucketSize);
  const count = Math.floor(max / bucketSize) - start + 1;
  const labels = Array.from(
    { length: count },
    (_, i) => (start + i) * bucketSize,
  );
  const shares = groups.map((scores) => {
    const out = new Array(count).fill(0);
    for (const s of scores) {
      out[Math.floor(s / bucketSize) - start] += 100 / scores.length;
    }
    return out;
  });
  return { labels, bucketSize, shares };
}

const MIS_PICK_MIN_GAP = 0.15;
const MIS_PICK_RATIO = 3;

export function likelyMisPick(simMean, grid, stage, slot) {
  const gapOf = (scores) =>
    scores?.length ? Math.abs(simMean / mean(scores) - 1) : Infinity;
  const chosen = gapOf(grid?.[stage - 1]?.[slot - 1]);
  if (!grid || chosen < MIS_PICK_MIN_GAP) return null;
  let best = null;
  grid.forEach((row, s) =>
    row.forEach((scores, k) => {
      const gap = gapOf(scores);
      if (gap * MIS_PICK_RATIO < chosen && (!best || gap < best.gap)) {
        best = { stage: s + 1, slot: k + 1, gap };
      }
    }),
  );
  return best;
}

// A stage page's line about the rehearsals players shared for it: how many,
// from how many players, and the median gap between the simulator and the
// game. Never one comparison on its own: below MIN_SOURCES players there is
// no line at all.
export const STAGE_GAP_MIN_SOURCES = 3;
// A comparison with fewer rehearsal scores than this says too little.
export const STAGE_GAP_MIN_SCORES = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sums up one stage's comparisons, each with `simMean` (the simulator's mean
 * for its loadout, on the engine now running), its rehearsal and its source
 * (userHash or ipHash). The same loadout and scores shared twice count once,
 * and likely mis-picks (scores from another stage or slot than the one
 * picked) are left out. { count, sources, medianGap, medianAbsGap }, or null
 * if fewer than STAGE_GAP_MIN_SOURCES players are left.
 */
export function stageGapSummary(comparisons) {
  const unique = new Map();
  for (const c of comparisons) {
    const scores = c?.rehearsal?.scores;
    if (!Number.isFinite(c?.simMean) || !Array.isArray(scores)) continue;
    if (scores.length < STAGE_GAP_MIN_SCORES) continue;
    unique.set(
      JSON.stringify([c.loadout ?? null, !!c.enterPercents, scores]),
      c,
    );
  }
  const gaps = [];
  const sources = new Set();
  for (const c of unique.values()) {
    const source = c.userHash || c.ipHash;
    if (!source) continue;
    const { stage, slot, scores, grid } = c.rehearsal;
    const gap = compareScores([c.simMean], scores);
    if (!gap || !Number.isFinite(gap.diffPct)) continue;
    if (likelyMisPick(c.simMean, grid, stage, slot)) continue;
    gaps.push(gap.diffPct);
    sources.add(source);
  }
  if (sources.size < STAGE_GAP_MIN_SOURCES) return null;
  return {
    count: gaps.length,
    sources: sources.size,
    medianGap: median(gaps),
    medianAbsGap: median(gaps.map(Math.abs)),
  };
}
