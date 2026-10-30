// Pure, DOM-free reconstruction of overlapping-million rehearsal scores.
//
// When two adjacent per-character scores are both >= 1,000,000 the game renders
// them so close that the right number's leading digit ("1" or "2") visually
// collides with the left number's last digit. OCR then drops the right number's
// leading digit and may misread the left number's units digit. The result screen
// also shows, per stage, an isolated total that never overlaps anything, and the
// game guarantees the exact identity
//
//     stage_total = c1 + c2 + c3 + floor(max(c1, c2, c3) / 5)
//
// (the bonus badge is floor(max/5)), so the true scores can be reconstructed from
// the total alone via a small exhaustive search. The bonus, when available, is
// only an optional cross-check; this module is driven by the total.
//
// Layout — this file holds only the public entry points; the mechanism lives in
// rehearsalRecovery/:
//   ocrLines.js         — turning raw OCR text/lines into numbers (tokenizing a
//                          score row, finding and reading its total line).
//   checksumMath.js      — the checksum identity above + primitives every solver
//                          shares (MAX_SCORE/MAX_TOTAL, pickBest, ...).
//   candidateSolver.js   — the primary solver: per-slot candidate generation +
//                          checksum search ("M0-M5"), including the million-
//                          junction collision repair.
//   digitStreamSolver.js — the two-collision fallback, reconstructing straight
//                          from the row's raw digit stream when per-token
//                          splitting already lost interior digits.
//
// `stageVerified` and `recoverStage` below are the only functions rehearsal.js
// calls; everything else is re-exported for its unit test in tests/unit/, which
// exercises each solver's pure logic directly.
import {
  allTokens,
  numberOf,
  pairTotalLine,
  parseScoreToken,
  totalIsReliable,
} from "./rehearsalRecovery/ocrLines.js";
import { totalUsable } from "./rehearsalRecovery/checksumMath.js";
import {
  candidates,
  reconcileStage,
} from "./rehearsalRecovery/candidateSolver.js";
import { reconstructFromDigits } from "./rehearsalRecovery/digitStreamSolver.js";

export {
  allTokens,
  parseScoreToken,
  pairTotalLine,
  candidates,
  reconcileStage,
  reconstructFromDigits,
};

// Is a row's reading confirmed by a usable stage total (i.e. the checksum holds)?
// Used to admit a SINGLE-number row as a one-character stage and to rank
// candidates, telling a genuine breakdown row apart from the total / 総合力
// look-alikes that share its single-number shape. A one-character stage's total is
// c1 + floor(c1/5), a relationship those look-alikes do not satisfy, so they are
// rejected; a real one-character row passes.
export function stageVerified(rowText, raw, totalLine, cache) {
  const total = totalLine ? numberOf(totalLine) : null;
  if (!totalUsable(total, raw)) return false;
  let [, recovery] = reconcileStage(raw, total, null, true, cache);
  if (recovery === "flagged") {
    const alt = reconstructFromDigits(rowText.replace(/[^\d]/g, ""), total, null);
    if (alt) recovery = alt[1];
  }
  return recovery !== "flagged";
}

// Recover one stage's scores from its OCR row text + raw tokens + paired stage-
// total line (or null). Owns the full per-stage policy: checksum reconcile, the
// digit-stream fallback for the two-collision case, and the decision to trust a
// clean read versus flag it for review. Returns `{ scores, recovery }` where
// recovery is "ok" | "repaired" | "flagged". It NEVER force-zeros a row that has
// values — an unverifiable read is kept as best-effort and flagged so the user can
// review it in the table (mirroring gakumas-screenshot), rather than silently
// dropping correct data.
export function recoverStage(
  rowText,
  raw,
  cleanThree,
  totalLine,
  rowConfidence,
  cache,
) {
  const total = totalLine ? numberOf(totalLine) : null;
  let [fixed, recovery] = reconcileStage(raw, total, null, false, cache);
  if (recovery === "flagged" && total != null) {
    const digits = rowText.replace(/[^\d]/g, "");
    const alt = reconstructFromDigits(digits, total, null);
    if (alt && alt[1] !== "flagged") [fixed, recovery] = alt;
  }

  // Verified by the total, or a clean read the total did not contradict.
  if (recovery !== "flagged") return { scores: fixed.slice(), recovery };

  // A total is trusted to overrule a clean read only when it is reliable (clean
  // grouping == digit concatenation) AND read at no-lower confidence than the row.
  // The confidence gate is the portable analog of gakumas-screenshot's
  // multi-threshold total re-OCR (commit 3be5b78): on real data a substituted
  // total digit (e.g. 1,358,696 -> 1,558,696) OCRs at very low confidence while
  // the clean row OCRs high, so a lower-confidence total must not condemn it.
  const reliableTotal =
    totalLine != null &&
    totalUsable(total, raw) &&
    totalIsReliable(totalLine.text, total) &&
    totalLine.confidence >= (rowConfidence ?? 0);

  // A clean three-number read: keep it. Trust it as "ok" when the only thing
  // against it is a low-confidence/garbage total; flag it for review when a
  // genuinely reliable total disproves it (likely lost digits) — but still keep
  // the best-effort values, never zero them.
  if (cleanThree) {
    return { scores: fixed.slice(), recovery: reliableTotal ? "flagged" : "ok" };
  }

  // A degraded/fragmentary row we could not verify: keep best-effort, flagged.
  return { scores: fixed.slice(), recovery: "flagged" };
}
