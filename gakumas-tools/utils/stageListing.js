// Which stages can have a listing of shared runs: a game stage's, never a
// custom one. Safe to use in the browser, unlike sharedRuns.js.
export function isListableStageId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// How many listed runs a stage's page shows, best first.
export const STAGE_RUNS_LIMIT = 20;

/**
 * Where a run with this mean would sit among a stage's listed runs, which
 * come best first by their server-simulated mean. index is the row it goes
 * before (after any run that scores the same or better); rank is index + 1.
 * When the list is full and every run beats it, it's somewhere below what's
 * shown, so rank is null and below is true.
 */
export function placeAmongRuns(runs, mean, limit = STAGE_RUNS_LIMIT) {
  if (!Array.isArray(runs) || !Number.isFinite(mean)) return null;
  let index = 0;
  for (const run of runs) {
    const theirs = run?.stats?.mean;
    if (Number.isFinite(theirs) && theirs >= mean) index++;
    else break;
  }
  const below = index === runs.length && runs.length >= limit;
  return { index, rank: below ? null : index + 1, below };
}
