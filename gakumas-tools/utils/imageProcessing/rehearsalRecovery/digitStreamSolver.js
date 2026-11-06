// Fallback for the two-collision case (three adjacent >= 1,000,000 scores), where
// scrambled commas make the per-token tokenization in ocrLines.js lose interior
// digits before candidateSolver.js ever sees clean slots. This works directly on
// the row's raw digit stream instead, guided by the stage total.
import {
  MAX_SCORE,
  MAX_TOTAL,
  derivedBonus,
  checksumOk,
  pickBest,
} from "./checksumMath.js";

// A per-character score is at most 7 digits (one below MAX_SCORE), and each of
// the two non-first scores may carry a duplicated leading "1" (8 digits, see
// partOptions), so a stage row's digit stream holds at most 7 + 8 + 8 digits.
const MAX_SCORE_DIGITS = 7;
const MAX_STREAM_DIGITS = 3 * MAX_SCORE_DIGITS + 2;

const DIGITS_0_9 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// Every way to pick one item from each list (cartesian product). cartesian([])
// is [[]] — one empty pick. Here the lists are tiny (<= 3 parts, <= 10 options
// each), so the product stays small.
function cartesian(lists) {
  return lists.reduce(
    (combos, list) =>
      combos.flatMap((combo) => list.map((item) => [...combo, item])),
    [[]],
  );
}

// Same invariant as candidateSolver's physicallyValid (a restore needs a >= 1M
// left neighbour and can't be leftmost; invariants 2-3), applied to this
// solver's explicit boolean `restored` flags. `vals` supplies the neighbour
// magnitudes.
function restoreValid(restored, vals) {
  for (let i = 0; i < restored.length; i++)
    if (restored[i] && (i === 0 || vals[i - 1] < 1_000_000)) return false;
  return true;
}

// All ways to write `sum` as `partCount` ordered part-lengths, each in
// [min, max]. E.g. compositions(4, 2, 1, 7) -> [[1,3],[2,2],[3,1]].
function compositions(sum, partCount, min, max) {
  const results = [];
  const current = [];
  function extend(remaining, partsLeft) {
    if (partsLeft === 0) {
      if (remaining === 0) results.push(current.slice());
      return;
    }
    for (let len = min; len <= Math.min(max, remaining); len++) {
      const rest = remaining - len;
      if (rest < (partsLeft - 1) * min || rest > (partsLeft - 1) * max) continue;
      current.push(len);
      extend(rest, partsLeft - 1);
      current.pop();
    }
  }
  extend(sum, partCount);
  return results;
}

function splitByLengths(stream, lengths) {
  const parts = [];
  let offset = 0;
  for (const len of lengths) {
    parts.push(stream.slice(offset, offset + len));
    offset += len;
  }
  return parts;
}

// The values one digit-stream part could represent: its literal reading, plus the
// collision-victim repairs for the part's length. A leading digit is corrupted
// only at a junction, whose left operand is >= 1M (enforced by the caller's
// restore-validity guard for multi-part stages); a single-part stage (k == 1) is a
// lone-glyph fix with no junction, so those repairs are offered with no neighbour
// constraint. Each option carries a `restored` flag. Empty when nothing is in range.
//   - non-first 6-digit: lost its leading "1,"/"2," -> d,XXX,XXX (d in 1..9).
//   - non-first / single 7-digit impossible (>= MAX_SCORE): leading digit was
//     SUBSTITUTED (e.g. "0"+"1" overlap misread as "4") -> replace it with 1 or 2.
//   - non-first 8-digit with equal first two digits: leading "1" was DUPLICATED ->
//     drop one (collapse to 7). single 8-digit: a spurious leading digit -> drop it.
function partOptions(partDigits, index, partCount) {
  const literal = parseInt(partDigits, 10);
  const len = partDigits.length;
  const isFirst = index === 0;
  const single = partCount === 1;
  const options = [];
  if (literal < MAX_SCORE) options.push({ value: literal, restored: false });

  if (!isFirst && len === 6) {
    for (let d = 1; d <= 9; d++) {
      const rv = d * 1_000_000 + literal;
      if (rv >= MAX_SCORE) break;
      options.push({ value: rv, restored: true });
    }
  }
  if (!isFirst && len === 7 && literal >= MAX_SCORE) {
    const tail = literal % 1_000_000;
    for (let d = 1; d <= 2; d++) {
      const rv = d * 1_000_000 + tail;
      if (rv < MAX_SCORE) options.push({ value: rv, restored: true });
    }
  }
  if (!isFirst && len === 8 && partDigits[0] === partDigits[1]) {
    const rv = parseInt(partDigits.slice(1), 10);
    if (rv < MAX_SCORE) options.push({ value: rv, restored: true });
  }

  if (single && len === 8) {
    const rv = parseInt(partDigits.slice(1), 10);
    if (rv >= 1_000_000 && rv < MAX_SCORE)
      options.push({ value: rv, restored: true });
  }
  if (single && len === 7 && literal >= MAX_SCORE) {
    const tail = literal % 1_000_000;
    for (let d = 1; d <= 2; d++) {
      const rv = d * 1_000_000 + tail;
      if (rv < MAX_SCORE) options.push({ value: rv, restored: true });
    }
  }
  return options;
}

// For one candidate partition (already restore-validated), try every replacement
// units digit on each slot immediately LEFT of a restored slot — the collision
// can misread that slot's units. Append every variant satisfying the total (and
// bonus) to `solutions`, costed as (#restores + #changed units digits).
function recordUnitsVariants(scores, restored, total, bonusOk, solutions) {
  const corruptSlots = [];
  for (let i = 0; i < 2; i++) if (restored[i + 1]) corruptSlots.push(i);
  const restoreCount = restored.filter(Boolean).length;

  for (const unitsDigits of cartesian(corruptSlots.map(() => DIGITS_0_9))) {
    const combo = scores.slice();
    let unitsChanges = 0;
    let inRange = true;
    corruptSlots.forEach((slot, idx) => {
      const replaced = Math.floor(scores[slot] / 10) * 10 + unitsDigits[idx];
      if (replaced >= MAX_SCORE) inRange = false;
      if (unitsDigits[idx] !== scores[slot] % 10) unitsChanges++;
      combo[slot] = replaced;
    });
    if (!inRange) continue;
    if (!checksumOk(combo, total)) continue;
    if (bonusOk != null && derivedBonus(combo) !== bonusOk) continue;
    solutions.push([combo, restoreCount + unitsChanges]);
  }
}

// Reconstruct a stage directly from the score row's raw digit stream (commas and
// spaces removed), guided by the total: try every way to split the stream into up
// to three consecutive scores, restoring a dropped leading digit on non-first
// 6-digit parts and searching each collision junction's left-neighbour units,
// then keep only splits that satisfy the exact total (and bonus).
// Returns [ [c1, c2, c3], recovery ] or null. Requires a usable total.
export function reconstructFromDigits(digits, total, bonus) {
  if (total == null || total < 1 || total > MAX_TOTAL) return null;
  const stream = String(digits).replace(/\D/g, "");
  if (stream.length === 0 || stream.length > MAX_STREAM_DIGITS) return null;
  const bonusOk =
    bonus != null && bonus < 1_000_000 && bonus < total ? bonus : null;

  const solutions = [];
  const maxParts = Math.min(3, stream.length);
  for (let partCount = 1; partCount <= maxParts; partCount++) {
    // Parts may be up to 8 digits: a colliding leading "1" is sometimes DUPLICATED
    // by OCR (read as "11") rather than dropped, inflating one part to 8 digits.
    const splits = compositions(stream.length, partCount, 1, 8);
    for (const lengths of splits) {
      const parts = splitByLengths(stream, lengths);
      const optionsPerPart = parts.map((part, i) =>
        partOptions(part, i, partCount),
      );
      if (optionsPerPart.some((opts) => opts.length === 0)) continue;

      for (const choice of cartesian(optionsPerPart)) {
        const scores = [0, 0, 0];
        const restored = [false, false, false];
        choice.forEach((opt, i) => {
          scores[i] = opt.value;
          restored[i] = opt.restored;
        });
        // A restored part needs a >= 1M left neighbour (a collision partner). This
        // junction rule does not apply to a single-part stage (k == 1): its repair
        // is a lone-glyph fix, not a junction, so the guard is skipped there.
        if (partCount > 1 && !restoreValid(restored, scores)) continue;

        recordUnitsVariants(scores, restored, total, bonusOk, solutions);
      }
    }
  }

  // Bonus is already applied per-variant, so pickBest needs no bonus disambiguation.
  return pickBest(solutions, null);
}
