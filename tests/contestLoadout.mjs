/**
 * Accuracy harness for contest loadout screenshot import.
 *
 * Fixtures are hand-labeled ground truth (tests/contestLoadout.jsonl), so
 * failures mean the parser is wrong, not that the baseline needs updating.
 * Stat numbers and stage inference must be exact; icon classification must
 * stay at or above MIN_ICON_ACCURACY.
 *
 * Usage:
 *   pnpm test:contest-loadout              # check against labels
 *   pnpm test:contest-loadout --visualize  # also write box overlays
 *   pnpm test:contest-loadout --digits     # rebuild digit templates from labels
 *
 * Badges are labeled as shown, [dot, score, genki, cost, bottom icon?], null
 * when absent.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, parse } from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { PItems, SkillCards, Stages } from "gakumas-data";
import { IdolConfig } from "gakumas-engine";
import { detectLoadoutBoxes } from "../gakumas-tools/utils/imageProcessing/contestLoadoutGeometry.js";
import {
  readStats,
  statGlyphs,
} from "../gakumas-tools/utils/imageProcessing/contestLoadoutStats.js";
import {
  classifyCrops,
  firstPItemFilter,
  ICON_SIZE,
} from "../gakumas-tools/utils/imageProcessing/entityClassifier.js";
import {
  badgeGlyphs,
  CONTEST_LAYOUT,
  readBadges,
  readLoadoutCards,
} from "../gakumas-tools/utils/imageProcessing/cardBadges.js";
import {
  addGlyphs,
  BADGE_KEYS,
  buildBadgeTemplates,
  compareBadges,
  labeledContestCards,
  loadContestFixture,
  loadImage,
  writeTemplates,
} from "./badges.mjs";
import { findStageCandidates } from "../gakumas-tools/utils/supportBonus.js";

const bestStage = (...args) => findStageCandidates(...args)[0] ?? null;

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HARNESS_DIR, "..");
const OVERLAY_DIR = join(HARNESS_DIR, "overlays", "contest_loadout");
const PUBLIC = join(REPO_ROOT, "gakumas-tools/public");
const DIGITS_PATH = join(
  REPO_ROOT,
  "gakumas-tools/utils/imageProcessing/contestLoadoutDigits.json",
);
const BADGE_DIGITS_PATH = join(
  REPO_ROOT,
  "gakumas-tools/utils/imageProcessing/cardBadgeDigits.json",
);
const MIN_ICON_ACCURACY = 0.98;
const MAX_BADGE_MISREAD_RATE = 0.005;
const MIN_CUSTOMIZATION_ACCURACY = 0.98;
const MIN_ICON_READ_ACCURACY = 0.75;

const args = process.argv.slice(2);
const VISUALIZE = args.includes("--visualize");
const DIGITS = args.includes("--digits");

async function loadModel(name) {
  return {
    session: await ort.InferenceSession.create(
      join(PUBLIC, `${name}_model.onnx`),
    ),
    classes: JSON.parse(
      readFileSync(join(PUBLIC, `${name}_classes.json`), "utf8"),
    ),
  };
}

// Pads boxes that overhang the image edge, like canvas drawImage does.
async function crop(image, box) {
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const right = Math.min(image.width, box.x + box.width);
  const bottom = Math.min(image.height, box.y + box.height);
  const extracted = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .extract({ left, top, width: right - left, height: bottom - top })
    .extend({
      left: left - box.x,
      top: top - box.y,
      right: box.x + box.width - right,
      bottom: box.y + box.height - bottom,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  return sharp(extracted, {
    raw: { width: box.width, height: box.height, channels: 4 },
  })
    .resize(ICON_SIZE, ICON_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function classify(image, boxes, { session, classes }, allowed) {
  const slots = boxes.flatMap((box, i) => (box ? [i] : []));
  const crops = await Promise.all(slots.map((i) => crop(image, boxes[i])));
  const ids = await classifyCrops(
    ort,
    session,
    classes,
    crops,
    3,
    allowed && ((id, i) => allowed(id, slots[i])),
  );
  return boxes.map((box) => (box ? ids.shift() : 0));
}

async function writeOverlay(image, name, boxes) {
  mkdirSync(OVERLAY_DIR, { recursive: true });
  const rects = boxes
    .filter(([box]) => box)
    .map(
      ([b, color]) =>
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="${color}" stroke-width="2"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}">${rects}</svg>`;
  await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(join(OVERLAY_DIR, `${name}.png`));
}

async function buildDigitTemplates(fixture) {
  const sums = { value: {}, percent: {} };
  for (const entry of fixture) {
    const image = await loadImage(join(REPO_ROOT, entry.file));
    const lines = statGlyphs(image, detectLoadoutBoxes(image).mainRow);
    lines.forEach((line, i) => {
      const labeled = [
        ["value", line.value, entry.params[i]],
        ["percent", line.percent, entry.percents[i]],
      ];
      for (const [font, glyphs, number] of labeled) {
        if (!glyphs) continue;
        const digits = String(number);
        if (glyphs.length !== digits.length) {
          throw new Error(
            `${entry.file}: ${glyphs.length} glyphs for ${font} ${number}`,
          );
        }
        addGlyphs(sums, font, glyphs, digits);
      }
    });
  }
  writeTemplates(sums, DIGITS_PATH);
}

async function badgeSamples(fixture) {
  const samples = [];
  for await (const { image, box, label } of labeledContestCards(fixture)) {
    samples.push({ glyphs: badgeGlyphs(image, box, CONTEST_LAYOUT), label });
  }
  return samples;
}

function planOf(params, pItemIds, skillCardIdGroups) {
  return new IdolConfig({ params, pItemIds, skillCardIdGroups }).plan;
}

const pItemName = (id) => (id ? PItems.getById(id)?.name || `#${id}` : "-");
const cardName = (id) => (id ? SkillCards.getById(id)?.name || `#${id}` : "-");

function compareIcons(file, kind, expected, actual, nameOf) {
  const errors = [];
  expected.forEach((id, i) => {
    if (actual[i] !== id) {
      errors.push(
        `${file} ${kind}[${i}] expected ${nameOf(id)} got ${nameOf(actual[i])}`,
      );
    }
  });
  return errors;
}

async function main() {
  const fixture = loadContestFixture();
  if (DIGITS) {
    await buildDigitTemplates(fixture);
    await buildBadgeTemplates(await badgeSamples(fixture), BADGE_DIGITS_PATH);
    return;
  }

  const [pItemModel, skillCardModel] = await Promise.all([
    loadModel("p_item"),
    loadModel("skill_card"),
  ]);

  let iconCards = 0;
  let iconsRead = 0;
  let badgeCards = 0;
  let unreadBadges = 0;
  const misreadBadges = [];
  const inconsistentCards = [];
  let iconSlots = 0;
  const iconErrors = [];
  const failures = [];
  const readFailures = [];
  for (const entry of fixture) {
    const image = await loadImage(join(REPO_ROOT, entry.file));
    let boxes, stats;
    try {
      boxes = detectLoadoutBoxes(image);
      stats = readStats(image, boxes.mainRow);
    } catch (err) {
      failures.push(`${entry.file} threw: ${err.message}`);
      continue;
    }

    const cardBoxes = [...boxes.mainBoxes, ...boxes.subBoxes];
    const classified = await classify(image, cardBoxes, skillCardModel);
    const pItems = await classify(
      image,
      boxes.pItemBoxes,
      pItemModel,
      firstPItemFilter(classified.slice(0, boxes.mainBoxes.length)),
    );
    const { skillCardIdGroups: skillCards } = readLoadoutCards(
      image,
      [boxes.mainBoxes, boxes.subBoxes],
      [
        classified.slice(0, boxes.mainBoxes.length),
        classified.slice(boxes.mainBoxes.length),
      ],
    );
    const cards = skillCards.flat();
    const labeledIds = entry.skillCards.flat();
    iconSlots += entry.pItems.length + labeledIds.length;
    iconErrors.push(
      ...compareIcons(entry.file, "pItems", entry.pItems, pItems, pItemName),
      ...compareIcons(
        entry.file,
        "main",
        entry.skillCards[0],
        skillCards[0],
        cardName,
      ),
      ...compareIcons(
        entry.file,
        "sub",
        entry.skillCards[1],
        skillCards[1],
        cardName,
      ),
    );

    entry.badges.flat().forEach((label, i) => {
      const id = labeledIds[i];
      if (!label || !cardBoxes[i] || cards[i] !== id) return;
      const read = readBadges(image, cardBoxes[i], CONTEST_LAYOUT);
      const result = compareBadges(`${entry.file} #${i}`, id, read, label);
      badgeCards++;
      unreadBadges += result.unread;
      misreadBadges.push(...result.misread);
      if (result.inconsistent) inconsistentCards.push(result.inconsistent);
      if (result.iconRight !== undefined) {
        iconCards++;
        if (result.iconRight) iconsRead++;
      }
    });

    if (stats.params.join() !== entry.params.join()) {
      failures.push(
        `${entry.file} params expected ${entry.params} got ${stats.params}`,
      );
    }
    if (stats.percents.join() !== entry.percents.join()) {
      readFailures.push(
        `${entry.file} percents expected ${entry.percents} got ${stats.percents}`,
      );
    }
    const expected = bestStage(entry.params, entry.percents, {
      plan: planOf(entry.params, entry.pItems, entry.skillCards),
    });
    const inferred = bestStage(stats.params, stats.percents, {
      plan: planOf(stats.params, pItems, skillCards),
    });
    const plan = planOf(entry.params, entry.pItems, entry.skillCards);
    const expectedPlan = expected && Stages.getById(expected.stageId).plan;
    if (!expected) {
      failures.push(`${entry.file} no contest stage fits the labeled stats`);
    } else if (expectedPlan !== plan && expectedPlan !== "free") {
      failures.push(`${entry.file} no ${plan} stage fits the labeled stats`);
    } else if (JSON.stringify(inferred) !== JSON.stringify(expected)) {
      failures.push(
        `${entry.file} inferred ${JSON.stringify(inferred)} expected ${JSON.stringify(expected)}`,
      );
    }

    if (VISUALIZE) {
      await writeOverlay(image, parse(entry.file).name, [
        ...boxes.pItemBoxes.map((b) => [b, "orange"]),
        ...boxes.mainBoxes.map((b) => [b, "red"]),
        ...boxes.subBoxes.map((b) => [b, "magenta"]),
      ]);
    }
  }

  const accuracy = 1 - iconErrors.length / iconSlots;
  const badgeAccuracy = 1 - inconsistentCards.length / badgeCards;
  for (const error of iconErrors) console.log(`  icon: ${error}`);
  for (const misread of misreadBadges) console.log(`  badge: ${misread}`);
  for (const card of inconsistentCards) console.log(`  customization: ${card}`);
  for (const failure of readFailures) console.error(`✗ ${failure}`);
  for (const failure of failures) console.error(`✗ ${failure}`);
  console.log(
    `\n${fixture.length} screenshots, icons ${iconSlots - iconErrors.length}/${iconSlots} ` +
      `(${(accuracy * 100).toFixed(1)}%), ${readFailures.length} misread stats, ` +
      `${failures.length} wrong stage/support bonus\n` +
      `${badgeCards} cards: ${misreadBadges.length} misread / ${unreadBadges} unread badges, ` +
      `customizations match shown badges on ${badgeCards - inconsistentCards.length} ` +
      `(${(badgeAccuracy * 100).toFixed(1)}%), ` +
      `bottom icon right on ${iconsRead}/${iconCards} uncustomized cards`,
  );
  if (
    failures.length ||
    readFailures.length ||
    accuracy < MIN_ICON_ACCURACY ||
    misreadBadges.length >
      MAX_BADGE_MISREAD_RATE *
        (BADGE_KEYS.length * badgeCards - unreadBadges) ||
    badgeAccuracy < MIN_CUSTOMIZATION_ACCURACY ||
    iconsRead < MIN_ICON_READ_ACCURACY * iconCards
  ) {
    process.exit(1);
  }
}

await main();
