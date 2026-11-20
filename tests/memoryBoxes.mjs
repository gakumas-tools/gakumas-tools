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
 *   5. Compare against hand labels (memoryBoxes.jsonl): params, P-items,
 *      cards, card badges, the P-idol, each card's cost kind, and the game's
 *      displayed total, recomputed from what was read.
 *
 * The labels were made by hand from the screens, not from the importer's
 * output, so there is no --update. Every miss must be listed in KNOWN: the
 * harness fails on a miss that isn't, and on a listed miss that no longer
 * happens. A card the nav pill covers (COVERED) may read as covered: the
 * importer leaves it empty and flags the memory, so its total isn't checked. Entries with `rejects` are screens that aren't a memory's stage
 * loadout (the プロデュース tab), which the import must refuse.
 *
 * Labels: badges per card are [customization dot, top-left number, genki
 * shield, cost]; costKinds per card are "normal" (green heart), "hp" (red
 * heart) or "other" (a plain number); power is the total shown over the
 * memory's art.
 *
 * tests/fixtures/memory/account holds the account's 32 memories (ステージ tab,
 * phone 1080x2424, 2026-11-17, WebP q90). Card names are printed under each
 * card; every label was checked against its screen.
 *
 * Usage:
 *   pnpm test:memory              # compare; non-zero exit on a new or fixed miss
 *   pnpm test:memory --visualize  # also write overlays to tests/overlays/memory/
 *   pnpm test:memory --digits     # rebuild card badge digit templates (with contest labels)
 *   pnpm test:memory --icons      # rebuild bottom effect icon templates (with art and contest
 *                                 # labels), and check them leaving each screen out
 *
 * Tesseract auto-downloads its English language model on first run; the
 * harness directs that download into tests/.tesseract-cache/ (gitignored)
 * rather than the repo root.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename, parse } from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { createWorker } from "tesseract.js";
import { CROPS_OUT, isTrainingScreen, writeCrop } from "./classifierCrops.mjs";
import { PItems, SkillCards } from "gakumas-data";
import { findParams } from "../gakumas-tools/utils/imageProcessing/memory.js";
import {
  getPItemBoundingBoxes,
  getSkillCardBoundingBoxes,
} from "../gakumas-tools/utils/imageProcessing/memoryGeometry.js";
import {
  classifyCrops,
  COVERED_ENTITY_ID,
  ICON_SIZE,
} from "../gakumas-tools/utils/imageProcessing/entityClassifier.js";
import {
  MEMORY_LAYOUT,
  readBadges,
  badgeGlyphs,
  CONTEST_LAYOUT,
  readCustomizations,
} from "../gakumas-tools/utils/imageProcessing/cardBadges.js";
import { calculateContestPower } from "../gakumas-tools/utils/contestPower.js";
import {
  buildBadgeTemplates,
  closestIcon,
  compareBadges,
  labeledContestCards,
  loadContestFixture,
} from "./badges.mjs";
import { buildIconTemplates, iconSample } from "./effectIconTemplates.mjs";
import { predictBadges } from "../gakumas-tools/utils/inferCustomizations.js";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HARNESS_DIR, "..");
const FIXTURE_PATH = join(HARNESS_DIR, "memoryBoxes.jsonl");
const BADGE_DIGITS_PATH = join(
  REPO_ROOT,
  "gakumas-tools/utils/imageProcessing/cardBadgeDigits.json",
);
// The badge digit templates come from both the contest loadouts' and these
// memories' labels: only memory screens show some dark score digits (3, 7).
const DIGITS = process.argv.includes("--digits");
const ICONS = process.argv.includes("--icons");
const OVERLAY_DIR = join(HARNESS_DIR, "overlays", "memory");
const TESSERACT_CACHE = join(HARNESS_DIR, ".tesseract-cache");
const PUBLIC = join(REPO_ROOT, "gakumas-tools/public");
const SKILL_CARD_MODEL = join(PUBLIC, "skill_card_model.onnx");
const SKILL_CARD_CLASSES = join(PUBLIC, "skill_card_classes.json");
const P_ITEM_MODEL = join(PUBLIC, "p_item_model.onnx");
const P_ITEM_CLASSES = join(PUBLIC, "p_item_classes.json");

// Misses the importer makes today. Each is checked against the screen.
const KNOWN = new Set([
  // The game's total differs from contest power recomputed from labels that match the screen
  // (params, P-items and cards all right), so a data value or the formula is off. Cause not found yet.
  "power: tests/fixtures/memory/account/m15.webp expected 5364 got 5385",
  "power: tests/fixtures/memory/account/m32.webp expected 1683 got 1794",
]);

// Card slots the game's nav pill lies across, checked on each screen: all
// that shows is the cost and a strip of frame (or, for an empty slot, the
// pill over the background). pill/p* are the n* screens drawn at 1080x1960.
const COVERED = new Set([
  "tests/fixtures/memory/03.png [4]",
  "tests/fixtures/memory/03.png [5]",
  ...Array.from({ length: 11 }, (_, n) => String(n + 1).padStart(2, "0")).flatMap((n) => [
    `tests/fixtures/memory/pill/p${n}.webp [4]`,
    `tests/fixtures/memory/pill/p${n}.webp [5]`,
  ]),
]);

const args = process.argv.slice(2);
const VISUALIZE = args.includes("--visualize");

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

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

// Round/clamp because the OCR-derived box origin is fractional.
function clampBox(image, box) {
  const left = Math.max(0, Math.round(box.x));
  const top = Math.max(0, Math.round(box.y));
  const width = Math.min(image.width - left, Math.round(box.width));
  const height = Math.min(image.height - top, Math.round(box.height));
  return { left, top, width, height };
}

async function cropBox(image, box) {
  return sharp(image.pixels, { raw: image.raw })
    .extract(clampBox(image, box))
    .resize(ICON_SIZE, ICON_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function exportCrops(image, entry, boxes, model) {
  for (const [i, box] of boxes.entries()) {
    const id = entry.skillCards[i];
    if (!id) continue;
    const { data, info } = await sharp(image.pixels, { raw: image.raw })
      .extract(clampBox(image, box))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const native = { data, raw: { width: info.width, height: info.height, channels: info.channels } };
    await writeCrop(model, entry.file, i, id, native, await cropBox(image, box));
  }
}

async function classifyBoxes(image, boxes, session, classes, keepCovered) {
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
  return classifyCrops(ort, session, classes, crops, 3, undefined, undefined, keepCovered);
}

async function detectMemory(image, ocrWorker) {
  const ocrInput = await binarizeForOcr(image);
  const result = await ocrWorker.recognize(ocrInput, {}, { blocks: true });
  const lines = extractLines(result);
  const { index: idx, params } = findParams(
    lines,
    { ...image, data: image.pixels },
    image.width,
  );
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
    params,
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
  return readFileSync(FIXTURE_PATH, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// Cost kinds, as the card's badge shows them: a green heart ("normal": genki
// first, then stamina), a red heart ("hp": stamina directly), or a plain
// number ("other": another resource, such as 好印象 turns).
function costKind(cardId) {
  const action = (SkillCards.getById(cardId)?.cost || [])
    .flatMap((line) => line.actions || [])
    .find((a) => a.op === "-=");
  if (!action || action.lhs === "cost") return "normal";
  return action.lhs === "stamina" ? "hp" : "other";
}

// The P-idol the importer gives the memory, as getMemoryFromFile does: from
// the first card with one, flagged when the P-items name another.
function pIdolOf(pItems, skillCards) {
  const of = (ids, get) =>
    ids.filter(Boolean).map(get).find((e) => e?.pIdolId)?.pIdolId;
  return {
    cards: of(skillCards, SkillCards.getById),
    items: of(pItems, PItems.getById),
  };
}

async function main() {
  const fixture = loadFixture();
  const [{ skillCard, pItem }, ocrWorker] = await Promise.all([
    getModels(),
    getOcrWorker(),
  ]);

  const misses = [];
  const miss = (kind, file, text) => misses.push(`${kind}: ${file} ${text}`);
  const tally = {
    screens: 0,
    rejected: 0,
    params: 0,
    pItems: [0, 0],
    cards: [0, 0],
    covered: [0, 0],
    badges: [0, 0],
    unread: 0,
    power: [0, 0],
  };

  const badgeSamples = [];
  const iconSamples = [];
  for (const entry of fixture) {
    const absPath = join(REPO_ROOT, entry.file);
    const image = await loadImage(absPath);
    let detection;
    try {
      detection = await detectMemory(image, ocrWorker);
    } catch (err) {
      if (entry.rejects) {
        tally.rejected++;
        console.log(`✓ ${entry.file}  refused: ${err.message}`);
      } else {
        miss("threw", entry.file, err.message);
      }
      continue;
    }
    if (entry.rejects) {
      miss("accepted", entry.file, "read as a memory, but it has no stage loadout");
      continue;
    }
    if (CROPS_OUT) {
      if (isTrainingScreen(entry.file)) await exportCrops(image, entry, detection.skillCardBoxes, skillCard);
      continue;
    }
    tally.screens++;

    const { params } = detection;
    const pItems = await classifyBoxes(image, detection.pItemBoxes, pItem.session, pItem.classes);
    const reads = await classifyBoxes(
      image,
      detection.skillCardBoxes,
      skillCard.session,
      skillCard.classes,
      true,
    );
    const coveredReads = reads.map((id) => id === COVERED_ENTITY_ID);
    const skillCards = reads.map((id) => (id === COVERED_ENTITY_ID ? 0 : id));

    if (arraysEqual(entry.params, params)) tally.params++;
    else miss("params", entry.file, `expected ${entry.params} got ${params}`);
    entry.pItems.forEach((id, i) => {
      tally.pItems[1]++;
      if (pItems[i] === id) tally.pItems[0]++;
      else miss("pItem", entry.file, `[${i}] expected ${pItemName(id)} got ${pItemName(pItems[i])}`);
    });
    entry.skillCards.forEach((id, i) => {
      const covered = COVERED.has(`${entry.file} [${i}]`);
      if (covered) tally.covered[1]++;
      else tally.cards[1]++;
      if (coveredReads[i] && covered) tally.covered[0]++;
      else if (coveredReads[i]) miss("card", entry.file, `[${i}] expected ${cardName(id)} got (covered)`);
      else if (skillCards[i] === id) tally[covered ? "covered" : "cards"][0]++;
      else miss("card", entry.file, `[${i}] expected ${cardName(id)} got ${cardName(skillCards[i])}`);
    });

    // A card's cost kind comes from its data, so this checks the labeled card
    // against its screen, not the reader.
    (entry.costKinds || []).forEach((kind, i) => {
      const id = entry.skillCards[i];
      if (kind && costKind(id) !== kind) {
        miss("cost kind", entry.file, `[${i}] ${cardName(id)} is ${costKind(id)} in the data, ${kind} on screen`);
      }
    });

    const pIdol = pIdolOf(pItems, skillCards);
    if (entry.pIdolId !== undefined && pIdol.cards !== entry.pIdolId) {
      miss("pIdol", entry.file, `expected ${entry.pIdolId} got ${pIdol.cards}`);
    }
    if (pIdol.items && pIdol.cards && pIdol.items !== pIdol.cards) {
      miss("pIdol", entry.file, `P-items say ${pIdol.items}, cards say ${pIdol.cards}`);
    }

    const imageData = { data: image.pixels, width: image.width, height: image.height };
    const customizations = skillCards.map((id, i) =>
      readCustomizations(imageData, detection.skillCardBoxes[i], MEMORY_LAYOUT, id),
    );
    (entry.badges || []).forEach((label, i) => {
      if (!label || skillCards[i] !== entry.skillCards[i]) return;
      if (DIGITS) {
        const glyphs = badgeGlyphs(imageData, detection.skillCardBoxes[i], MEMORY_LAYOUT);
        badgeSamples.push({ glyphs, label });
        return;
      }
      if (ICONS) {
        if (label[0] === 0) {
          const box = detection.skillCardBoxes[i];
          iconSamples.push(iconSample(imageData, box, MEMORY_LAYOUT.icon, skillCards[i], entry.file));
        }
        return;
      }
      tally.badges[1]++;
      const read = readBadges(imageData, detection.skillCardBoxes[i], MEMORY_LAYOUT);
      const { misread, unread, inconsistent, iconRight } = compareBadges(`#${i}`, skillCards[i], read, label);
      tally.unread += unread;
      if (!misread.length && !inconsistent) tally.badges[0]++;
      for (const m of misread) miss("badge", entry.file, m);
      if (inconsistent) miss("customization", entry.file, inconsistent);
      if (iconRight === false) {
        const predicted = predictBadges(skillCards[i]).icon;
        miss("badge", entry.file, `#${i} bottom icon read ${closestIcon(read.icon)} data ${predicted}`);
      }
    });

    // The game's own total: the importer flags a memory whose total it can't
    // reproduce, so this checks params, P-items, cards, customizations and
    // the data's contest power together.
    if (entry.power !== undefined && !coveredReads.some(Boolean)) {
      tally.power[1]++;
      const power = calculateContestPower(params, pItems, skillCards, customizations);
      if (power === entry.power) tally.power[0]++;
      else miss("power", entry.file, `expected ${entry.power} got ${power}`);
    }

    if (VISUALIZE) {
      const out = await writeOverlay(image, absPath, detection);
      console.log(`    overlay → ${out}`);
    }
  }

  await ocrWorker.terminate();
  if (DIGITS) {
    for await (const { image, box, label } of labeledContestCards(loadContestFixture())) {
      badgeSamples.push({ glyphs: badgeGlyphs(image, box, CONTEST_LAYOUT), label });
    }
    buildBadgeTemplates(badgeSamples, BADGE_DIGITS_PATH);
    return;
  }
  if (ICONS) {
    await buildIconTemplates(iconSamples.filter(Boolean));
    return;
  }

  const newMisses = misses.filter((m) => !KNOWN.has(m));
  const fixed = [...KNOWN].filter((m) => !misses.includes(m));
  for (const m of misses) {
    (KNOWN.has(m) ? console.log : console.error)(`  ${m}${KNOWN.has(m) ? " (known)" : ""}`);
  }
  for (const m of fixed) console.error(`✗ now right, remove from KNOWN: ${m}`);
  const rejects = fixture.filter((e) => e.rejects).length;
  console.log(
    `\n${tally.screens} memory screens: params ${tally.params}/${tally.screens}, ` +
      `P-items ${tally.pItems[0]}/${tally.pItems[1]}, cards ${tally.cards[0]}/${tally.cards[1]} ` +
      `(covered by the nav pill: ${tally.covered[0]}/${tally.covered[1]} read or left for the player), ` +
      `badges ${tally.badges[0]}/${tally.badges[1]} (${tally.unread} unread), ` +
      `power ${tally.power[0]}/${tally.power[1]}; ${tally.rejected}/${rejects} other screens refused`,
  );
  if (newMisses.length || fixed.length) {
    console.error(`\n${newMisses.length} new misses, ${fixed.length} known misses now right.`);
    process.exit(1);
  }
  console.log("Every miss is known.");
}

await main();
