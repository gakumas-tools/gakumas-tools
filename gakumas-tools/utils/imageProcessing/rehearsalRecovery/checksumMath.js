// The game's stage-total checksum identity, and the small pure primitives every
// solver (candidateSolver.js, digitStreamSolver.js) builds on top of it:
//
//     stage_total = c1 + c2 + c3 + floor(max(c1, c2, c3) / 5)
//
// (the bonus badge is floor(max/5)). The true scores can be reconstructed from
// the total alone via a small exhaustive search; the bonus, when available, is
// only an optional cross-check.

// Hard ceiling (exclusive) for in-collision recovery candidates: a per-character
// score is at most ~2,000,000 today, so this is the ceiling used to bound
// candidate generation and reject impossible reconstructions.
export const MAX_SCORE = 3_000_000;

// Largest plausible stage total: a total above this is OCR garbage, not a real
// checksum, and is never trusted.
export const MAX_TOTAL = 9_999_999;

// floor(max/5) — the bonus the game would render for this combo.
export function derivedBonus(combo) {
  return Math.floor(Math.max(combo[0], combo[1], combo[2]) / 5);
}

// The game's stage-total identity. The whole module's premise.
export function checksumOk(combo, total) {
  return combo[0] + combo[1] + combo[2] + derivedBonus(combo) === total;
}

// Deterministic lexicographic order on triples.
export function comboCompare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Pick the lowest-cost solution from [[combo, cost], ...] and label the recovery,
// or null if there are none. When several tie at min cost, an optional bonus value
// disambiguates (callers that already filtered by bonus pass null); an unresolved
// tie or a bonus disagreement is "flagged".
//
// `rawScores`, when supplied (candidateSolver's reconcileStage), classifies by
// whether the scores actually CHANGED rather than by raw cost: a clean score that
// the checksum confirms only under a comma-deleted total carries a non-zero
// selection penalty but was not edited, so it is "ok", not "repaired". The
// digit-stream caller omits it and falls back to the cost rule (cost 0 == a
// clean read == "ok").
export function pickBest(solutions, bonusOk, rawScores) {
  if (solutions.length === 0) return null;
  const minCost = solutions.reduce((m, s) => Math.min(m, s[1]), Infinity);
  let best = solutions.filter((s) => s[1] === minCost).map((s) => s[0]);
  if (best.length > 1 && bonusOk != null) {
    const corro = best.filter((c) => derivedBonus(c) === bonusOk);
    if (corro.length) best = corro;
  }
  best.sort(comboCompare);
  best = best.filter((c, i) => i === 0 || comboCompare(c, best[i - 1]) !== 0);
  const chosen = best[0];
  const bonusDisagrees = bonusOk != null && derivedBonus(chosen) !== bonusOk;
  const unchanged = rawScores != null && comboCompare(chosen, rawScores) === 0;
  const recovery =
    best.length > 1 || bonusDisagrees
      ? "flagged"
      : unchanged || minCost === 0
        ? "ok"
        : "repaired";
  return [chosen, recovery];
}

// A raw slot's plausible magnitude. An impossible value (>= MAX_SCORE — a leading
// glyph misread like 4,177,174) is treated as its 1,XXX,XXX repair so it does not
// over-bound the total used to validate it; everything else is itself.
export function plausibleFloor(value) {
  return value < MAX_SCORE ? value : 1_000_000 + (value % 1_000_000);
}

// Is `total` a usable stage total for these raw scores? The bounds every solver
// trusts before folding a total into the checksum search. Compares against the
// slots' plausible magnitudes, as the candidate solver does, so a misread
// leading glyph the solver can repair doesn't disqualify the total.
export function totalUsable(total, raw) {
  return (
    total != null &&
    total > 0 &&
    total <= MAX_TOTAL &&
    total >= Math.max(...raw.map(plausibleFloor))
  );
}
