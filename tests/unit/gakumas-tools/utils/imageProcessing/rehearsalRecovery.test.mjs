// Pure-logic unit tests for the rehearsal score recovery solver.
//
// Run with Node's built-in test runner (no dependency):
//   pnpm test   # or: node --test tests/unit/gakumas-tools/utils/imageProcessing/rehearsalRecovery.test.mjs
//
// The vectors are real-data ground truth ported from the Rust solver in the
// sister project gakumas-screenshot (src/ocr/reconcile.rs, the spec). Where the
// JS and Rust disagree, the Rust is correct. Each block is grouped by the
// capability/milestone that makes it pass (see docs/EXECPLAN_TOOLS_SOLVER_PARITY_PORT.md
// in gakumas-screenshot). The solver module is pure and DOM-free, so it is tested
// here without a browser; the end-to-end pipeline is covered by tests/rehearsalScores.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileStage,
  reconstructFromDigits,
  recoverStage,
  candidates,
  allTokens,
  parseScoreToken,
} from "../../../../../gakumas-tools/utils/imageProcessing/rehearsalRecovery.js";

// --- M0 baseline: already-passing behavior, proving the harness works. ---

test("baseline: 003 mode-B overflow recovers", () => {
  assert.deepEqual(reconcileStage([1327534, 151661, 0], 2744700, 265506), [
    [1327533, 1151661, 0],
    "repaired",
  ]);
});

test("baseline: 102842 one junction, all three >= 1M", () => {
  assert.deepEqual(reconcileStage([1172669, 161196, 1093518], 3661912, 234533), [
    [1172665, 1161196, 1093518],
    "repaired",
  ]);
});

test("baseline: already-correct read stays ok", () => {
  assert.deepEqual(reconcileStage([912127, 1171024, 1004816], 3322171, 234204), [
    [912127, 1171024, 1004816],
    "ok",
  ]);
});

test("baseline: clean three-number line tokenizes", () => {
  assert.deepEqual(allTokens("912,1271,171,0241,004,816").map(parseScoreToken), [
    912127, 1171024, 1004816,
  ]);
});

test("baseline: digit-stream two-collision (iter9)", () => {
  assert.deepEqual(
    reconstructFromDigits("13142492065371103897", 3887528, 262849),
    [[1314245, 1206537, 1103897], "repaired"],
  );
});

// --- M1: faithful cost model breaks the unit-trade tie correctly. ---

test("M1: asymmetric cost picks the physically-correct repair (not the unit-traded one)", () => {
  // Two combos satisfy the checksum at plain edit cost 2; the asymmetric cost
  // (units edit on the slot LEFT of a million-restore is cheap, on the restored
  // slot itself is expensive) must pick [1327533, 1151661, 0], never [1327534, 1151660, 0].
  assert.deepEqual(reconcileStage([1327534, 151661, 0], 2744700, null), [
    [1327533, 1151661, 0],
    "repaired",
  ]);
});

// --- M2: Prepend candidates + "1"->"2" swap. ---

test("M2: '1'->'2' swap recovers (it131)", () => {
  assert.deepEqual(
    reconcileStage([1201271, 2396184, 1541984], 4447841, 308396),
    [[1201277, 1396184, 1541984], "repaired"],
  );
});

test("M2: '1'->'2' swap recovers (it194)", () => {
  assert.deepEqual(reconcileStage([1415951, 2093004, 964825], 3756977, 283191), [
    [1415957, 1093004, 964825],
    "repaired",
  ]);
});

test("M2: genuine 2M is not swapped (regression)", () => {
  assert.deepEqual(reconcileStage([2134567, 500000, 300000], 3361480, 426913), [
    [2134567, 500000, 300000],
    "ok",
  ]);
});

test("M2: a prepend base (852,517) is offered for 52,517", () => {
  const vals = candidates(52517).map((c) => (typeof c === "number" ? c : c.value));
  assert.ok(vals.includes(852517), "candidates(52517) should include 852517");
});

// --- M3: comma-leaked total tolerated via one-digit deletion. ---

test("M3: comma-inserted total keeps a clean single score ok (3935454 -> 393454)", () => {
  assert.deepEqual(reconcileStage([327879, 0, 0], 3935454, null), [
    [327879, 0, 0],
    "ok",
  ]);
});

// --- M4: no-checksum fallbacks (bonus-driven, single-char, multi-score flag). ---

test("M4: single-char leading '1'->'4' recovers (4,177,174 -> 1,177,174)", () => {
  assert.deepEqual(reconcileStage([4177174, 0, 0], 1412608, null), [
    [1177174, 0, 0],
    "repaired",
  ]);
});

test("M4: single-char leading '1'->'4' with bonus recovers", () => {
  assert.deepEqual(reconcileStage([4172520, 0, 0], 1407024, 234504), [
    [1172520, 0, 0],
    "repaired",
  ]);
});

test("M4: single-char dropped leading digit via total-solve (55,172 -> 855,172)", () => {
  assert.deepEqual(reconcileStage([55172, 0, 0], 1026206, 171034), [
    [855172, 0, 0],
    "repaired",
  ]);
  assert.deepEqual(reconcileStage([92118, 0, 0], 1070541, 178423), [
    [892118, 0, 0],
    "repaired",
  ]);
});

test("M4: transposed total but bonus corroborates raw -> ok", () => {
  assert.deepEqual(reconcileStage([1119377, 0, 0], 1343525, 223875), [
    [1119377, 0, 0],
    "ok",
  ]);
});

test("M4: bonus contradicts and total unusable -> flagged", () => {
  assert.deepEqual(reconcileStage([500000, 0, 0], 9999999, 123456), [
    [500000, 0, 0],
    "flagged",
  ]);
});

test("M4: multi-score row with unsatisfiable usable total -> flagged (it200)", () => {
  assert.deepEqual(reconcileStage([1383, 64377, 364], 4315292, null), [
    [1383, 64377, 364],
    "flagged",
  ]);
});

test("M4: clean single score with matching total stays ok (regression)", () => {
  assert.deepEqual(reconcileStage([994573, 0, 0], 1193487, null), [
    [994573, 0, 0],
    "ok",
  ]);
});

// --- M5: digit-stream fallback parity (substitution / duplication). ---

test("M5: impossible 7-digit middle part (iter337)", () => {
  assert.deepEqual(
    reconstructFromDigits("115624040238471089584", 3500919, 231248),
    [[1156240, 1023847, 1089584], "repaired"],
  );
});

test("M5: leading-digit substituted (iter372)", () => {
  assert.deepEqual(
    reconstructFromDigits("13499404057372861381", 3538681, 269988),
    [[1349940, 1057372, 861381], "repaired"],
  );
});

test("M5: leading-digit substituted (iter174)", () => {
  assert.deepEqual(
    reconstructFromDigits("106173042382811170156", 3717823, 247656),
    [[1061730, 1238281, 1170156], "repaired"],
  );
});

test("M5: duplicated leading digit, 21-digit stream (iter71)", () => {
  assert.deepEqual(
    reconstructFromDigits("118499711023254644786", 3090036, 236999),
    [[1184997, 1023254, 644786], "repaired"],
  );
});

test("M5: single-char split with spurious leading digit (iter400)", () => {
  assert.deepEqual(reconstructFromDigits("41110707", 1332848, 222141), [
    [1110707, 0, 0],
    "repaired",
  ]);
});

// --- recoverStage: keep-and-flag, never zero; total-confidence guard. ---

const totalLine = (text, confidence) => ({ text, confidence });

test("recoverStage: a clean row stands when only a LOW-confidence total contradicts it (iter44/iter53 fix)", () => {
  // Row OCRs cleanly at conf 96; its total OCR'd 1,558,696 (true 1,358,696) at
  // conf 0. The low-confidence total must not condemn the clean row -> kept, "ok".
  const r = recoverStage(
    "583,951 303,196 354,759",
    [583951, 303196, 354759],
    true,
    totalLine("1,558,696", 0),
    96,
  );
  assert.deepEqual(r, { scores: [583951, 303196, 354759], recovery: "ok" });
});

test("recoverStage: a verified clean row is ok", () => {
  // total = 100000*3 + floor(100000/5) = 320000.
  const r = recoverStage(
    "100,000 100,000 100,000",
    [100000, 100000, 100000],
    true,
    totalLine("320,000", 80),
    70,
  );
  assert.deepEqual(r, { scores: [100000, 100000, 100000], recovery: "ok" });
});

test("recoverStage: an unverifiable degraded row is KEPT (best-effort) and flagged, never zeroed", () => {
  const raw = [1231, 14, 105126];
  const r = recoverStage(
    "1,231,14 105126",
    raw,
    false, // not a clean three-number read
    totalLine("3,542,572", 85),
    55,
  );
  assert.equal(r.recovery, "flagged");
  assert.notDeepEqual(r.scores, [0, 0, 0]); // the regression: must not zero
  assert.deepEqual(r.scores, raw);
});

test("recoverStage: a clean row a RELIABLE high-confidence total disproves is flagged (still kept, not zeroed)", () => {
  // raw sums (with bonus) to 320000 but the reliable, high-confidence total says
  // 900000 -> unverifiable -> flagged, but the values are kept for review.
  const raw = [100000, 100000, 100000];
  const r = recoverStage(
    "100,000 100,000 100,000",
    raw,
    true,
    totalLine("900,000", 90),
    70,
  );
  assert.equal(r.recovery, "flagged");
  assert.notDeepEqual(r.scores, [0, 0, 0]);
});
