/**
 * Regression harness for rehearsal-screenshot score parsing.
 *
 * Mirrors `memoryBoxes.mjs`. For each fixture screenshot:
 *   1. Preprocess the same way `getScoresFromFile` does in the browser:
 *      upscale 2x if narrower than 1200px, then binarize with the
 *      white-text threshold (190).
 *   2. Run Tesseract OCR with block output.
 *   3. Parse stage scores with the production `extractScores`.
 *   4. Compare against the pinned baseline.
 *
 * Usage:
 *   pnpm test:rehearsal           # compare; non-zero exit on mismatch
 *   pnpm test:rehearsal --update  # rewrite the fixture with current outputs
 *
 * Tesseract's English model comes from the @tesseract.js-data/eng
 * devDependency (4.0.0_best_int, the model the site loads for
 * createWorker("eng", 1)), so the harness runs with no network.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { extractScores } from "../gakumas-tools/utils/imageProcessing/rehearsal.js";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HARNESS_DIR, "..");
const FIXTURE_PATH = join(HARNESS_DIR, "rehearsalScores.jsonl");
const TESSDATA = join(
  dirname(createRequire(import.meta.url).resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0_best_int"
);

// Mirrors getScoresFromFile (rehearsal.js): white threshold and OCR upscaling
const WHITE_THRESHOLD = 190;
const OCR_MIN_WIDTH = 1200;

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");

let _ocrWorker;
async function getOcrWorker() {
  if (!_ocrWorker) {
    _ocrWorker = await createWorker("eng", 1, {
      langPath: TESSDATA,
      cacheMethod: "none",
    });
  }
  return _ocrWorker;
}

// Upscale + binarize: white text becomes black on white, everything else
// white. Mirrors `getWhiteCanvas` from utils/imageProcessing/common.js so
// OCR sees the same input the browser produces.
async function binarizeForOcr(absPath) {
  const meta = await sharp(absPath).metadata();
  let pipeline = sharp(absPath).removeAlpha();
  if (meta.width < OCR_MIN_WIDTH) pipeline = pipeline.resize(meta.width * 2);
  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    const isText =
      data[i] > WHITE_THRESHOLD &&
      data[i + 1] > WHITE_THRESHOLD &&
      data[i + 2] > WHITE_THRESHOLD;
    const v = isText ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .png()
    .toBuffer();
}

async function detectScores(absPath, ocrWorker) {
  const ocrInput = await binarizeForOcr(absPath);
  const result = await ocrWorker.recognize(ocrInput, {}, { blocks: true });
  // extractScores returns { scores, flags }; the harness baselines scores only.
  return extractScores(result).scores;
}

function loadFixture() {
  let text;
  try {
    text = readFileSync(FIXTURE_PATH, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => JSON.parse(l));
}

const FIXTURE_FIELD_ORDER = ["file", "note", "scores"];

function writeFixture(entries) {
  const lines = entries.map((e) => {
    const ordered = {};
    for (const k of FIXTURE_FIELD_ORDER) {
      if (e[k] !== undefined) ordered[k] = e[k];
    }
    return JSON.stringify(ordered);
  });
  writeFileSync(FIXTURE_PATH, lines.join("\n") + "\n");
}

function scoresEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatScores(scores) {
  return scores.map((row) => `[${row.join(", ")}]`).join(" ");
}

async function main() {
  const fixture = loadFixture();
  if (fixture.length === 0) {
    console.error(
      `Fixture is empty: ${FIXTURE_PATH}\n` +
        `Add entries with: pnpm test:rehearsal --update`,
    );
    process.exit(2);
  }

  const ocrWorker = await getOcrWorker();

  const updated = [];
  let failed = 0;
  for (const entry of fixture) {
    const absPath = join(REPO_ROOT, entry.file);
    let scores;
    try {
      scores = await detectScores(absPath, ocrWorker);
    } catch (err) {
      failed++;
      console.error(`✗ ${entry.file}  threw: ${err.message}`);
      updated.push(entry);
      continue;
    }

    if (!Array.isArray(entry.scores)) {
      failed++;
      console.error(
        `? ${entry.file}  (no baseline; rerun with --update to capture)\n` +
          `    scores: ${formatScores(scores)}`,
      );
    } else if (scoresEqual(entry.scores, scores)) {
      console.log(`✓ ${entry.file}  scores=${formatScores(scores)}`);
    } else {
      failed++;
      console.error(`✗ ${entry.file}`);
      console.error(`    expected ${formatScores(entry.scores)}`);
      console.error(`    got      ${formatScores(scores)}`);
    }

    updated.push({
      file: entry.file,
      ...(entry.note !== undefined && { note: entry.note }),
      scores,
    });
  }

  await ocrWorker.terminate();

  if (UPDATE) {
    writeFixture(updated);
    console.log(`\nFixture rewritten (${updated.length} entries).`);
    process.exit(0);
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${fixture.length} cases failed.`);
    console.error(`If the change is intentional, rerun with --update.`);
    process.exit(1);
  }
  console.log(`\nAll ${fixture.length} cases passed.`);
}

await main();
