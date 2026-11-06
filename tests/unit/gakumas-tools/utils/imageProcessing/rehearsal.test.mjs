import { test } from "node:test";
import assert from "node:assert/strict";
import { extractScores } from "../../../../../gakumas-tools/utils/imageProcessing/rehearsal.js";

// A synthetic OCR result for the three-stage rehearsal screen: per stage a
// label, the stage total, and the breakdown row below it.
function ocrResult(stages) {
  const lines = [];
  stages.forEach(({ total, row }, i) => {
    const y = i * 300;
    const line = (text, y0) => ({
      text,
      confidence: 90,
      bbox: { x0: 0, y0, x1: 1000, y1: y0 + 40 },
      words: [],
    });
    lines.push(line(`+ ステージ${i + 1} +`, y));
    if (total) lines.push(line(total, y + 50));
    lines.push(line(row, y + 150));
  });
  return { data: { blocks: [{ paragraphs: [{ lines }] }] } };
}

// total = sum + floor(max / 5)
const STAGE_2 = { total: "846,000Pt", row: "300,000 200,000 286,000" };
const STAGE_3 = { total: "212,720Pt", row: "177,267" };

test("three verified stages come back in stage order", () => {
  const { scores, flags } = extractScores(
    ocrResult([{ total: "461,013Pt", row: "384,178" }, STAGE_2, STAGE_3]),
  );
  assert.deepEqual(scores, [
    [384178, 0, 0],
    [300000, 200000, 286000],
    [177267, 0, 0],
  ]);
  assert.deepEqual(flags, ["ok", "ok", "ok"]);
});

test("a missed stage row flags every stage instead of shifting them", () => {
  // Stage 1's total is misread, so its single-number row can't be verified
  // and is dropped; the remaining rows would shift up a stage.
  const { flags } = extractScores(
    ocrResult([{ total: "461,018Pt", row: "384,178" }, STAGE_2, STAGE_3]),
  );
  assert.deepEqual(flags, ["flagged", "flagged", "flagged"]);
});

test("a single-number row with a repairable leading glyph is kept", () => {
  // 4,177,174 is impossible; the solver repairs it to 1,177,174, which the
  // total 1,412,608 verifies (1,177,174 + 235,434).
  const { scores } = extractScores(
    ocrResult([{ total: "1,412,608Pt", row: "4,177,174" }, STAGE_2, STAGE_3]),
  );
  assert.deepEqual(scores[0], [1177174, 0, 0]);
  assert.deepEqual(scores[1], [300000, 200000, 286000]);
});
