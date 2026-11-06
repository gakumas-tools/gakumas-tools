// Per-slot candidate generation + checksum search ("M0-M5"): the primary solver,
// repairing a dropped/substituted leading digit in one slot — including the
// "million junction" collision described in rehearsalRecovery.js. Falls back to
// digitStreamSolver.js when per-token splitting has already lost digits (the
// two-collision case).
//
// Invariants relied on:
//   1. A per-character score is at most ~2,000,000 today; MAX_SCORE (3,000,000)
//      is the hard ceiling used to bound in-collision recovery.
//   2. An overlap happens only between two side-by-side scores both >= 1,000,000.
//   3. The damage is bounded: the right number loses its leading digit, and the
//      left number's units digit may be misread. Everything else is intact.
//   4/5. The stage-total identity (checksumMath.js) holds exactly.
//   6. A dropped leading "1," can leave a leading-zero group (1,062,741 ->
//      062,741), a definitive "a leading 1 was lost here" marker.
import {
  MAX_SCORE,
  MAX_TOTAL,
  derivedBonus,
  checksumOk,
  comboCompare,
  pickBest,
  plausibleFloor,
} from "./checksumMath.js";

// A candidate value for one slot, tagged with its provenance (`kind`) and whether
// its units digit was changed relative to the raw reading (`unitsEdited`). This
// mirrors the Rust `struct Cand { value, kind, units_edited }` / `enum BaseKind`,
// and is the seam that lets `cost` and `physicallyValid` agree on what kind of
// edit each candidate represents:
//   "raw"     — the raw OCR value, high-order digits unchanged.
//   "million" — a dropped leading "1,"/"2," restored AT A JUNCTION (raw + d*1e6);
//               physically valid only when the left neighbour is >= 1,000,000.
//   "prepend" — a dropped/substituted leading digit restored at the number's own
//               next decimal place (52,517 -> 852,517) or an impossible/substituted
//               leading glyph corrected (4,177,174 -> 1,177,174, 2,396,184 ->
//               1,396,184); a plain OCR edit, position-independent (no neighbour rule).
//
// Every slot offers the raw reading, optionally one or more restoration bases, and
// for every base >= 100,000 the ten units-digit variants (the units may be misread).
export function candidates(value) {
  if (value === 0) return [{ value: 0, kind: "raw", unitsEdited: false }];
  const rawUnits = value % 10;

  const bases = [{ value, kind: "raw" }];
  if (value >= 1000 && value < 1_000_000) {
    for (let d = 1; d <= 2; d++) {
      const restored = value + d * 1_000_000;
      if (restored >= MAX_SCORE) break;
      bases.push({ value: restored, kind: "million" });
    }
  }
  // Prepend, e.g. 52,517 -> 852,517 (no junction needed).
  if (value >= 1000 && value < 100_000) {
    const place = 10 ** String(value).length;
    for (let d = 1; d <= 9; d++) {
      const restored = d * place + value;
      if (restored >= MAX_SCORE) break;
      bases.push({ value: restored, kind: "prepend" });
    }
  }
  // Impossible >= 3,000,000 raw (a leading "1," misread as another glyph, e.g.
  // 4,177,174 for a true 1,177,174 / 2,177,174): restore the plausible million.
  if (value >= MAX_SCORE && value < 10_000_000) {
    const tail = value % 1_000_000;
    bases.push({ value: 1_000_000 + tail, kind: "prepend" });
    bases.push({ value: 2_000_000 + tail, kind: "prepend" });
  }
  // A valid-looking 2,XXX,XXX whose leading "1" was misread as "2" (2,396,184 for
  // a true 1,396,184). Offer the 1,XXX,XXX reading; the exact total disambiguates —
  // a genuine 2M score keeps its raw value at cost 0, so the swap only wins when
  // the checksum demands it.
  if (value >= 2_000_000 && value < MAX_SCORE) {
    bases.push({ value: 1_000_000 + (value % 1_000_000), kind: "prepend" });
  }

  // Dedup on (value, kind): the same number can arise as different kinds and they
  // cost differently, so they must not collapse (a collapse would also hide a real
  // min-cost tie). Order is irrelevant — ties break on whole solutions, not slots.
  const out = [];
  const seen = new Set();
  const push = (v, kind) => {
    if (v >= MAX_SCORE) return;
    const key = v + ":" + kind;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value: v, kind, unitsEdited: v % 10 !== rawUnits });
  };
  for (const { value: base, kind } of bases) {
    push(base, kind);
    if (base >= 100_000) {
      const tens = Math.floor(base / 10) * 10;
      for (let d = 0; d <= 9; d++) push(tens + d, kind);
    }
  }
  return out;
}

// Rejects a "million" restore whose left neighbour isn't >= 1,000,000, or is
// leftmost (invariants 2-3); a "prepend" restore carries no such constraint.
// Mirrors digitStreamSolver's restoreValid over its own boolean-flag
// representation.
function physicallyValid(combo, kinds) {
  for (let i = 0; i < 3; i++)
    if (kinds[i] === "million" && (i === 0 || combo[i - 1] < 1_000_000))
      return false;
  return true;
}

// Corruption-aware cost. NOT a plain edit count: +1 per restored slot (any
// non-"raw" kind); a units change costs +1 only when the slot is immediately LEFT
// of a "million" restore (the expected junction victim), else +3. This breaks
// unit-trade ties toward the physically correct reconstruction. `kinds` and
// `unitsEdited` come from the chosen candidates (not reconstructed from magnitudes,
// so a millions-digit edit like a 2M->1M swap is charged faithfully).
function cost(kinds, unitsEdited) {
  let c = 0;
  for (let i = 0; i < 3; i++) {
    if (kinds[i] !== "raw") c += 1;
    if (unitsEdited[i]) {
      const leftOfJunction = i + 1 < 3 && kinds[i + 1] === "million";
      c += leftOfJunction ? 1 : 3;
    }
  }
  return c;
}

// Structural-only fallback when no usable total is available. Without the
// checksum we cannot recover from the values alone, so the raw scores are
// returned. A total that was provided but rejected as garbage is suspicious
// (flagged), as is a collision-prone stage (a >= 1M slot with >= 2 non-zero
// slots) whose sum we cannot verify; an absent total with a corroborating (or
// absent) bonus is treated as a clean read (ok).
function structuralOnly(ocrScores, totalProvided, bonusOk) {
  const bonusDisagrees = bonusOk != null && derivedBonus(ocrScores) !== bonusOk;
  const nonzero = ocrScores.filter((s) => s > 0).length;
  const hasMillion = ocrScores.some((s) => s >= 1_000_000);
  const collisionProne = hasMillion && nonzero >= 2;
  const recovery =
    totalProvided || bonusDisagrees || collisionProne ? "flagged" : "ok";
  return [ocrScores.slice(), recovery];
}

// Plausible totals to test against the checksum: the literal total (penalty 0)
// plus every one-digit deletion of its decimal string (penalty 1, so the literal
// wins genuine ties). A deletion models the stage total's thousands comma being
// OCR'd as a spurious digit (e.g. "393,454" -> "3935454"). Deletions <= 0,
// > MAX_TOTAL, below `floor`, or equal to the literal are dropped.
function totalCandidates(total, floor) {
  const out = [[total, 0]];
  const s = String(total);
  if (s.length > 1) {
    const seen = new Set();
    for (let skip = 0; skip < s.length; skip++) {
      const v = parseInt(s.slice(0, skip) + s.slice(skip + 1), 10);
      if (v > 0 && v <= MAX_TOTAL && v >= floor && v !== total && !seen.has(v)) {
        seen.add(v);
        out.push([v, 1]);
      }
    }
  }
  return out;
}

// The unique per-character score `c` with `c + floor(c/5) == total`, if any.
// `c + c/5` is monotonic in `c`, so a tiny window around floor(total*5/6) suffices.
function solveSingle(total) {
  const approx = Math.floor((total * 5) / 6);
  for (let c = Math.max(0, approx - 3); c <= approx + 3; c++) {
    if (c + Math.floor(c / 5) === total) return c;
  }
  return null;
}

// Is `c` a plausible reading of raw — itself, or raw with a dropped leading digit
// restored (raw is c's low-order suffix, e.g. 55,172 -> 855,172)? Guards the
// single-character total-solve against a geometry-mispaired NEIGHBOURING stage's
// total, whose inverse checksum could otherwise solve to an unrelated `c`.
function isLeadingDigitReading(c, raw) {
  if (c === raw) return true;
  const place = 10 ** String(raw).length;
  return c > raw && c % place === raw;
}

// Best-effort repair driven by the bonus when the exact-total checksum found no
// solution (the total mis-OCR'd). The bonus equals floor(max/5), so if exactly one
// physically-valid junction million-restore (a sub-million non-leftmost slot whose
// left neighbour is >= 1M) makes the restored slot the maximum with floor(max/5)
// == bonus, apply it (leaving the other slots raw). Returns the combo or null if
// zero or several qualify. Always best-effort — the caller marks it "flagged".
function bonusDrivenRepair(raw, bonusOk) {
  if (bonusOk == null) return null;
  let hit = null;
  for (let i = 0; i < 3; i++) {
    if (i === 0 || !(raw[i] >= 1000 && raw[i] < 1_000_000) || raw[i - 1] < 1_000_000)
      continue;
    for (let d = 1; d <= 2; d++) {
      const restored = raw[i] + d * 1_000_000;
      if (restored >= MAX_SCORE) break;
      const combo = raw.slice();
      combo[i] = restored;
      const max = Math.max(combo[0], combo[1], combo[2]);
      if (max === restored && Math.floor(max / 5) === bonusOk) {
        if (hit != null && comboCompare(hit, combo) !== 0) return null; // ambiguous
        hit = combo;
      }
    }
  }
  return hit;
}

// Fallback ladder when the checksum search found no satisfying combination.
// A collision-prone stage (a >= 1M plausible slot and >= 2 non-zero slots) is
// flagged (the digit-stream fallback handles those). A single-character stage
// total-solves a dropped leading digit straight from the (comma-tolerant) total,
// corroborated by the bonus. A multi-score stage that reaches here had a usable
// total it could not satisfy, so digits were lost — flag, never silently accept.
// A lone (or empty) stage leans on the bonus: Ok when it corroborates (or is
// absent), else Flagged.
function resolveWithoutChecksum(ocrScores, totalSet, bonusOk) {
  const nonzero = ocrScores.filter((s) => s > 0).length;
  const hasMillion = ocrScores.some((s) => plausibleFloor(s) >= 1_000_000);
  if (hasMillion && nonzero >= 2) return [ocrScores.slice(), "flagged"];

  const idxs = [0, 1, 2].filter((i) => ocrScores[i] > 0);
  if (idxs.length === 1) {
    const idx = idxs[0];
    for (const [t] of totalSet.slice().sort((a, b) => a[1] - b[1])) {
      const c = solveSingle(t);
      if (
        c != null &&
        c < MAX_SCORE &&
        isLeadingDigitReading(c, ocrScores[idx]) &&
        (bonusOk == null || Math.floor(c / 5) === bonusOk)
      ) {
        const out = ocrScores.slice();
        out[idx] = c;
        return [out, c === ocrScores[idx] ? "ok" : "repaired"];
      }
    }
  }

  if (nonzero >= 2) return [ocrScores.slice(), "flagged"];

  const maxPlausible = Math.max(...ocrScores.map(plausibleFloor));
  if (bonusOk == null) return [ocrScores.slice(), "ok"];
  return Math.floor(maxPlausible / 5) === bonusOk
    ? [ocrScores.slice(), "ok"]
    : [ocrScores.slice(), "flagged"];
}

// The expensive part of reconcileStage: build every slot's candidates and search
// them against every plausible total. Pulled out so callers that reconcile the
// SAME (ocrScores, total, bonus) triple twice — stageVerified's strict pass
// during row discovery, then recoverStage's lenient pass on the rows that pass
// discovery — can share one search via `cache` instead of re-running it. `strict`
// does not affect this part (it only changes what happens when `result` is
// null), so it is deliberately excluded from the cache key.
function searchChecksum(ocrScores, total, bonus, cache) {
  const totalProvided = total != null;
  // Floor the total must clear is the largest PLAUSIBLE magnitude, so an impossible
  // raw (e.g. 4,177,174) does not reject its true smaller total.
  const maxRaw = Math.max(...ocrScores.map(plausibleFloor));
  const totalOk =
    total != null && total <= MAX_TOTAL && total >= maxRaw && total > 0
      ? total
      : null;
  const bonusOk =
    bonus != null && bonus < 1_000_000 && (totalOk == null || bonus < totalOk)
      ? bonus
      : null;

  if (totalOk == null) return { totalOk, bonusOk, totalProvided };

  const key = cache && `${ocrScores.join(",")}|${totalOk}|${bonusOk}`;
  if (cache?.has(key)) return cache.get(key);

  const cand = [
    candidates(ocrScores[0]),
    candidates(ocrScores[1]),
    candidates(ocrScores[2]),
  ];
  // The OCR'd total may carry one spuriously-inserted digit (a comma read as a
  // digit), so search every plausible total; a deletion-derived total carries a
  // small penalty so the literal always wins a genuine tie.
  const totalSet = totalCandidates(totalOk, maxRaw);
  const solutions = [];
  for (const [t, penalty] of totalSet)
    for (const a of cand[0])
      for (const b of cand[1])
        for (const c of cand[2]) {
          const combo = [a.value, b.value, c.value];
          const kinds = [a.kind, b.kind, c.kind];
          if (physicallyValid(combo, kinds) && checksumOk(combo, t))
            solutions.push([
              combo,
              cost(kinds, [a.unitsEdited, b.unitsEdited, c.unitsEdited]) + penalty,
            ]);
        }

  const out = {
    totalOk,
    bonusOk,
    totalProvided,
    totalSet,
    result: pickBest(solutions, bonusOk, ocrScores),
  };
  cache?.set(key, out);
  return out;
}

// Reconstruct one stage from raw OCR scores + optional total/bonus.
// Returns [ [a, b, c], "ok" | "repaired" | "flagged" ].
//
// `strict` (used by stageVerified for row CLASSIFICATION, not recovery) skips the
// no-checksum fallback ladder: a row is verified only by an exact-checksum
// solution, so a stage total or 総合力 look-alike — which the lenient fallbacks
// would otherwise resolve to a best-effort "ok" — stays "flagged" and is rejected.
//
// `cache`, when supplied, memoizes the checksum search (see searchChecksum) so a
// strict classification pass and a later lenient recovery pass over the same
// stage share one search instead of running it twice.
export function reconcileStage(ocrScores, total, bonus, strict = false, cache) {
  const { totalOk, bonusOk, totalProvided, totalSet, result } = searchChecksum(
    ocrScores,
    total,
    bonus,
    cache,
  );

  if (totalOk == null) {
    // No usable total. Try a bonus-driven repair (a unique leading-"1" restore the
    // bonus corroborates) before the conservative structural pass.
    const rep = bonusDrivenRepair(ocrScores, bonusOk);
    if (rep) return [rep, "flagged"];
    return structuralOnly(ocrScores, totalProvided, bonusOk);
  }

  if (result) return result;

  // No combination satisfied any plausible total. For classification (strict) this
  // is a definitive non-match. For recovery, try a bonus-driven repair, then the
  // no-checksum fallback ladder (single-character solve, multi-score flag).
  if (strict) return [ocrScores.slice(), "flagged"];
  const rep = bonusDrivenRepair(ocrScores, bonusOk);
  if (rep) return [rep, "flagged"];
  return resolveWithoutChecksum(ocrScores, totalSet, bonusOk);
}
