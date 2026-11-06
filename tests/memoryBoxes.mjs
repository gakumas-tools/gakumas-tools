/**
 * Regression harness for memory-screenshot classification.
 *
 * Mirrors `draftPickBoxes.mjs`. For each fixture screenshot:
 *   1. Binarize a copy to isolate dark text on white background.
 *   2. Run Tesseract OCR to find the Vo/Da/Vi/stamina parameter line and
 *      the "Pアイテム" label below it (the latter anchors all box positions).
 *   3. Compute p-item / skill-card boxes with the same geometry the browser
 *      uses (`memoryGeometry.js`).
 *   4. Crop each box, run the matching ONNX classifier, collect IDs.
 *   5. Compare IDs + parsed stat params against the pinned baseline.
 *
 * Usage:
 *   pnpm test:memory              # compare; non-zero exit on mismatch
 *   pnpm test:memory --update     # rewrite the fixture with current outputs
 *   pnpm test:memory --visualize  # also write overlays to tests/overlays/memory/
 *
 * Tesseract auto-downloads its English language model on first run; the
 * harness directs that download into tests/.tesseract-cache/ (gitignored)
 * rather than the repo root.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename, parse } from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { createWorker } from "tesseract.js";
import { PItems, SkillCards } from "gakumas-data";
import { extractParams } from "../gakumas-tools/utils/imageProcessing/memory.js";
import {
  getPItemBoundingBoxes,
  getSkillCardBoundingBoxes,
} from "../gakumas-tools/utils/imageProcessing/memoryGeometry.js";
import {
  classifyCrops,
  ICON_SIZE,
} from "../gakumas-tools/utils/imageProcessing/entityClassifier.js";
import {
  MEMORY_LAYOUT,
  readBadges,
} from "../gakumas-tools/utils/imageProcessing/cardBadges.js";
import { compareBadges } from "./badges.mjs";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HARNESS_DIR, "..");
const FIXTURE_PATH = join(HARNESS_DIR, "memoryBoxes.jsonl");
const OVERLAY_DIR = join(HARNESS_DIR, "overlays", "memory");
const TESSERACT_CACHE = join(HARNESS_DIR, ".tesseract-cache");
const PUBLIC = join(REPO_ROOT, "gakumas-tools/public");
const SKILL_CARD_MODEL = join(PUBLIC, "skill_card_model.onnx");
const SKILL_CARD_CLASSES = join(PUBLIC, "skill_card_classes.json");
const P_ITEM_MODEL = join(PUBLIC, "p_item_model.onnx");
const P_ITEM_CLASSES = join(PUBLIC, "p_item_classes.json");

const PARAMS_REGEXP = /^\s*\d+\s+\d+\s+\d+\s+\d+\s*$/;

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const VISUALIZE = args.includes("--visualize");

let _models;
async function getModels() {
  if (!_models) {
    const [skillCard, pItem] = await Promise.all([
      ort.InferenceSession.create(SKILL_CARD_MODEL),
      ort.InferenceSession.create(P_ITEM_MODEL),
    ]);
    _models = {
      skillCard: {
        session: skillCard,
        classes: JSON.parse(readFileSync(SKILL_CARD_CLASSES, "utf8")),
      },
      pItem: {
        session: pItem,
        classes: JSON.parse(readFileSync(P_ITEM_CLASSES, "utf8")),
      },
    };
  }
  return _models;
}

let _ocrWorker;
async function getOcrWorker() {
  if (!_ocrWorker) {
    mkdirSync(TESSERACT_CACHE, { recursive: true });
    _ocrWorker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE });
  }
  return _ocrWorker;
}

async function loadImage(absPath) {
  const { data, info } = await sharp(absPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    pixels: data,
    width: info.width,
    height: info.height,
    raw: { width: info.width, height: info.height, channels: 4 },
  };
}

// Binarize: pixel becomes black if it matches the "dark text" predicate
// (near-grayscale under 185, or the specific dark blue-gray text color
// the game uses), otherwise white. Mirrors `getBlackCanvas` from
// utils/imageProcessing/common.js so OCR sees the same input.
function binarizeForOcr(image) {
  const { pixels, width, height } = image;
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, o = 0; i < pixels.length; i += 4, o += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const avg = (r + g + b) / 3;
    const isText =
      (Math.abs(r - avg) < 8 &&
        Math.abs(g - avg) < 8 &&
        Math.abs(b - avg) < 8 &&
        r < 185 &&
        g < 185 &&
        b < 185) ||
      (r > 70 && r < 120 && g > 70 && g < 120 && b > 90 && b < 130);
    const v = isText ? 0 : 255;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
  }
  // Mirror getBlackCanvas: wipe a thin margin so dark window-frame edges in
  // desktop captures don't OCR as stray glyphs glued onto real lines.
  const margin = Math.ceil(width * 0.012);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (
        x >= margin &&
        x < width - margin &&
        y >= margin &&
        y < height - margin
      ) {
        continue;
      }
      const o = (y * width + x) * 3;
      out[o] = out[o + 1] = out[o + 2] = 255;
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function extractLines(result) {
  return result.data.blocks
    .map((b) => b.paragraphs.map((p) => p.lines))
    .flat(2);
}

async function classifyBoxes(image, boxes, session, classes) {
  const crops = await Promise.all(
    boxes.map(async (box) => {
      // Round/clamp because the OCR-derived box origin is fractional.
      const left = Math.max(0, Math.round(box.x));
      const top = Math.max(0, Math.round(box.y));
      const width = Math.min(image.width - left, Math.round(box.width));
      const height = Math.min(image.height - top, Math.round(box.height));
      return sharp(image.pixels, { raw: image.raw })
        .extract({ left, top, width, height })
        .resize(ICON_SIZE, ICON_SIZE, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer();
    }),
  );
  return classifyCrops(ort, session, classes, crops, 3);
}

async function detectMemory(image, ocrWorker) {
  const ocrInput = await binarizeForOcr(image);
  const result = await ocrWorker.recognize(ocrInput, {}, { blocks: true });
  const lines = extractLines(result);
  let idx = lines.findIndex((l) => PARAMS_REGEXP.test(l.text));
  if (idx < 0) {
    idx = lines.findIndex((line) => extractParams(line, image.width).length === 4);
  }
  if (idx < 0 || !lines[idx + 1]) {
    throw new Error(
      "Could not locate the Vo/Da/Vi/stamina parameter line. Is this a memory screenshot?",
    );
  }
  const paramsLine = lines[idx];
  const pItemsLabelLine = lines[idx + 1];
  const contentWidth = paramsLine.bbox.x1 - pItemsLabelLine.bbox.x0;
  const anchor = { x: pItemsLabelLine.bbox.x0, y: pItemsLabelLine.bbox.y1 };
  return {
    params: extractParams(paramsLine, image.width),
    pItemBoxes: getPItemBoundingBoxes(anchor, contentWidth),
    skillCardBoxes: getSkillCardBoundingBoxes(anchor, contentWidth),
    paramsBbox: paramsLine.bbox,
  };
}

function pItemName(id) {
  if (id === 0) return "(none)";
  return PItems.getById(id)?.name || `#${id}`;
}
function cardName(id) {
  if (id === 0) return "(none)";
  return SkillCards.getById(id)?.name || `#${id}`;
}

async function writeOverlay(image, absImagePath, detection) {
  mkdirSync(OVERLAY_DIR, { recursive: true });
  const out = join(OVERLAY_DIR, `${parse(basename(absImagePath)).name}_overlay.png`);
  const rect = (r, color) =>
    `<rect x="${Math.round(r.x ?? r.x0)}" y="${Math.round(r.y ?? r.y0)}" ` +
    `width="${Math.round(r.width ?? r.x1 - r.x0)}" ` +
    `height="${Math.round(r.height ?? r.y1 - r.y0)}" ` +
    `fill="none" stroke="${color}" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}">
${rect(detection.paramsBbox, "lime")}
${detection.pItemBoxes.map((b) => rect(b, "orange")).join("\n")}
${detection.skillCardBoxes.map((b) => rect(b, "red")).join("\n")}
</svg>`;
  await sharp(image.pixels, { raw: image.raw })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(out);
  return out;
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

const FIXTURE_FIELD_ORDER = ["file", "note", "params", "pItems", "skillCards", "badges"];

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

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main() {
  const fixture = loadFixture();
  if (fixture.length === 0) {
    console.error(
      `Fixture is empty: ${FIXTURE_PATH}\n` +
        `Add entries with: pnpm test:memory --update`,
    );
    process.exit(2);
  }

  const [{ skillCard, pItem }, ocrWorker] = await Promise.all([
    getModels(),
    getOcrWorker(),
  ]);

  const updated = [];
  let failed = 0;
  for (const entry of fixture) {
    const absPath = join(REPO_ROOT, entry.file);
    let image, detection, pItems, skillCards, params;
    try {
      image = await loadImage(absPath);
      detection = await detectMemory(image, ocrWorker);
      params = detection.params;
      pItems = await classifyBoxes(image, detection.pItemBoxes, pItem.session, pItem.classes);
      skillCards = await classifyBoxes(
        image,
        detection.skillCardBoxes,
        skillCard.session,
        skillCard.classes,
      );
    } catch (err) {
      failed++;
      console.error(`✗ ${entry.file}  threw: ${err.message}`);
      updated.push(entry);
      continue;
    }

    const hasBaseline =
      Array.isArray(entry.pItems) &&
      Array.isArray(entry.skillCards) &&
      Array.isArray(entry.params);
    if (!hasBaseline) {
      failed++;
      console.error(
        `? ${entry.file}  (no baseline; rerun with --update to capture)\n` +
          `    params: [${params.join(", ")}]\n` +
          `    pItems: [${pItems.map(pItemName).join(", ")}]\n` +
          `    cards:  [${skillCards.map(cardName).join(", ")}]`,
      );
    } else if (
      arraysEqual(entry.params, params) &&
      arraysEqual(entry.pItems, pItems) &&
      arraysEqual(entry.skillCards, skillCards)
    ) {
      console.log(
        `✓ ${entry.file}  params=[${params.join(",")}]  ` +
          `pItems=[${pItems.map(pItemName).join(", ")}]  ` +
          `cards=[${skillCards.map(cardName).join(", ")}]`,
      );
    } else {
      failed++;
      console.error(`✗ ${entry.file}`);
      if (!arraysEqual(entry.params, params)) {
        console.error(`    params expected [${entry.params.join(", ")}] got [${params.join(", ")}]`);
      }
      if (!arraysEqual(entry.pItems, pItems)) {
        console.error(`    pItems expected [${entry.pItems.map(pItemName).join(", ")}]`);
        console.error(`           got      [${pItems.map(pItemName).join(", ")}]`);
      }
      if (!arraysEqual(entry.skillCards, skillCards)) {
        console.error(`    cards  expected [${entry.skillCards.map(cardName).join(", ")}]`);
        console.error(`           got      [${skillCards.map(cardName).join(", ")}]`);
      }
    }

    const imageData = { data: image.pixels, width: image.width, height: image.height };
    const badgeProblems = (entry.badges || []).flatMap((label, i) => {
      if (!label || skillCards[i] !== entry.skillCards[i]) return [];
      const read = readBadges(imageData, detection.skillCardBoxes[i], MEMORY_LAYOUT);
      const { misread, inconsistent, iconRight } = compareBadges(`#${i}`, skillCards[i], read, label);
      const wrongIcon = iconRight === false && `#${i} bottom icon misread`;
      return [...misread, inconsistent, wrongIcon].filter(Boolean);
    });
    if (badgeProblems.length) {
      failed++;
      console.error(`✗ ${entry.file}  badges`);
      for (const problem of badgeProblems) console.error(`    ${problem}`);
    }

    if (VISUALIZE) {
      const out = await writeOverlay(image, absPath, detection);
      console.log(`    overlay → ${out}`);
    }

    updated.push({
      file: entry.file,
      ...(entry.note !== undefined && { note: entry.note }),
      params,
      pItems,
      skillCards,
      ...(entry.badges !== undefined && { badges: entry.badges }),
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
