import { extractLines, getWhiteCanvas, loadImageFromFile } from "./common";
import { cropIcons } from "./rehearsalIcons";
import {
  allTokens,
  parseScoreToken,
  pairTotalLine,
  recoverStage,
  stageVerified,
} from "./rehearsalRecovery";

const NUMERIC_LINE_REGEX = /^[\d\s,.—-]+$/;
const OCR_MIN_WIDTH = 1200;

function getOcrScale(img) {
  return img.width < OCR_MIN_WIDTH ? 2 : 1;
}

export async function getScoresFromFile(file, worker) {
  return recognizeScores(await loadImageFromFile(file), 190, worker);
}

export async function getScoresFromImage(img, worker) {
  return recognizeScores(img, 160, worker);
}

async function recognizeScores(img, threshold, worker) {
  const scale = getOcrScale(img);
  const canvas = getWhiteCanvas(img, threshold, scale);
  try {
    const result = await worker.recognize(canvas, {}, { blocks: true });
    const { scores, flags, rows } = extractScores(result);
    return { scores, flags, icons: cropIcons(img, rows, scale) };
  } finally {
    // Safari caps total canvas memory and frees it only on GC, which lags
    // behind a fast import loop. Release the backing store now.
    canvas.width = canvas.height = 0;
  }
}

// The rehearsal result screen always has exactly three stages. extractScores
// always returns three [c1, c2, c3] rows in stage order, using 0 for any value
// it could not read (a whole unreadable stage becomes [0, 0, 0]). This keeps the
// columns aligned so the user can fix any 0 cell manually in the table.
const NUM_STAGES = 3;

export function extractScores(result) {
  const lines = extractLines(result);
  // Shares the checksum search between a row's discovery-time strict pass
  // (stageVerified) and its final lenient pass (recoverStage) when both reconcile
  // the same (raw, total) pair — see searchChecksum in rehearsalRecovery.js.
  const reconcileCache = new Map();

  // Identify the breakdown rows WITHOUT any score-magnitude assumption (a
  // per-character score may be anywhere in [0, 3,000,000)). A stage may have one,
  // two, or three characters; missing characters are blank slots on the right, so
  // a one-character stage's row is a single number — visually indistinguishable
  // from the stage total or the 総合力 overall-power line. The discriminators are
  // structural plus the screen's own checksum:
  //  - a candidate row has no "+" (the stage label "+ ステージ N +" and the bonus
  //    "+NNNNNN" carry one; breakdown rows never do) and >= 1 numeric token;
  //  - a multi-number row (>= 2 numbers) is a real breakdown row by structure;
  //  - a SINGLE-number row is a (one-character) breakdown row only when the stage
  //    total directly above it verifies it (total == c1 + floor(c1/5)), which the
  //    total / 総合力 look-alikes fail;
  //  - among candidates, prefer checksum-verified rows, then the most digit-rich
  //    (three numbers >> a stray noise line), then order them top-to-bottom.
  const candidates = [];
  for (const line of lines) {
    if (line.text.includes("+")) continue;
    const toks = allTokens(line.text);
    const nums = toks.map(parseScoreToken);
    const numericCount = nums.filter((v) => v > 0).length;
    if (numericCount < 1) continue;

    const raw = [0, 0, 0];
    for (let i = 0; i < Math.min(3, nums.length); i++) raw[i] = nums[i];
    const verified = stageVerified(
      line.text,
      raw,
      pairTotalLine(line, lines, null),
      reconcileCache,
    );
    // A single-number row must be checksum-verified to count as a stage; a
    // multi-number row is a stage by structure (repaired or zero-filled later).
    if (numericCount < 2 && !verified) continue;

    candidates.push({
      line,
      raw,
      verified,
      cleanThree:
        line.confidence >= 60 &&
        NUMERIC_LINE_REGEX.test(line.text) &&
        toks.length === 3,
      digitCount: (line.text.match(/\d/g) || []).length,
    });
  }

  // Choose the three stages (verified first, then richest) and order them top-to-bottom.
  const stageRows = candidates
    .sort((a, b) => b.verified - a.verified || b.digitCount - a.digitCount)
    .slice(0, NUM_STAGES)
    .sort((a, b) => a.line.bbox.y0 - b.line.bbox.y0);
  const chosen = new Set(stageRows.map((s) => s.line));

  const scores = [];
  const flags = [];
  const rows = [];
  for (const { line, raw, cleanThree } of stageRows) {
    rows.push({
      bbox: line.bbox,
      words: (line.words || []).map((w) => w.bbox),
    });
    const totalLine = pairTotalLine(line, lines, chosen);
    const { scores: stageScores, recovery } = recoverStage(
      line.text,
      raw,
      cleanThree,
      totalLine,
      line.confidence,
      reconcileCache,
    );
    scores.push(stageScores);
    flags.push(recovery);
  }

  // Every stage has a row on screen, so finding fewer than three means one was
  // missed — and the found rows, numbered top to bottom, may have shifted into
  // the wrong stages. Flag every stage for review rather than trust them.
  if (stageRows.length < NUM_STAGES) {
    flags.fill("flagged");
  }

  // Always return three aligned stages, padding any not found with zeros.
  while (scores.length < NUM_STAGES) {
    scores.push([0, 0, 0]);
    flags.push(stageRows.length ? "flagged" : "ok");
    rows.push(null);
  }
  return { scores, flags, rows };
}
