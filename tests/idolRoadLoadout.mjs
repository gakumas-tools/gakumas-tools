/**
 * Accuracy harness for the Idol Road 「スコア獲得編成確認」 screenshot import.
 *
 * Fixtures are hand-labeled ground truth (tests/idolRoadLoadout.jsonl): each
 * line is one loadout, its top screenshot and the one with the deck scrolled
 * to the bottom. Stage, stats, which P-item slots are filled and which cards
 * are 重複 must be exact. Icons, badges and customizations must be exact too,
 * except for the misses listed in KNOWN: a miss that isn't listed fails, and
 * so does a listed one that no longer happens, so the list only ever shrinks.
 *
 * Usage:
 *   pnpm test:idol-road-loadout              # check against labels
 *   pnpm test:idol-road-loadout --visualize  # also write box overlays
 *   pnpm test:idol-road-loadout --digits     # rebuild stage digit templates from labels
 *   pnpm test:idol-road-loadout --print      # print what was read, one line per loadout
 *
 * Labels:
 *   pItems: [固定, chosen 1-4]. The 固定 slot holds the stage's own P-item,
 *     which has no id, so it is always null; fixedShown says whether the slot
 *     is filled. An empty chosen slot is 0.
 *   skillCards: rows, Main first, then one per Sub ("+" row). A 重複 card is
 *     labeled as the card it repeats; duplicates marks it.
 *   badges: as shown, [dot, score, genki, cost, bottom icon?], null when
 *     absent; null for a 重複 card or one whose badges can't be read by eye.
 *   null for any id that can't be told from the screenshot (not checked).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, parse } from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { PItems, SkillCards } from "gakumas-data";
import {
  detectIdolRoadLoadout,
  idolRoadCardFilter,
  liftGreyedOut,
  readIdolRoadCards,
  stageGlyphs,
} from "../gakumas-tools/utils/imageProcessing/idolRoadLoadout.js";
import {
  classifyCrops,
  ICON_SIZE,
} from "../gakumas-tools/utils/imageProcessing/entityClassifier.js";
import {
  CONTEST_LAYOUT,
  readBadges,
} from "../gakumas-tools/utils/imageProcessing/cardBadges.js";
import { addGlyphs, compareBadges, loadImage, writeTemplates } from "./badges.mjs";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HARNESS_DIR, "..");
const FIXTURE_PATH = join(HARNESS_DIR, "idolRoadLoadout.jsonl");
const OVERLAY_DIR = join(HARNESS_DIR, "overlays", "idol_road_loadout");
const PUBLIC = join(REPO_ROOT, "gakumas-tools/public");
const DIGITS_PATH = join(
  REPO_ROOT,
  "gakumas-tools/utils/imageProcessing/idolRoadDigits.json",
);
// Each checked against its screenshot.
const KNOWN = new Set([
  // The classifier takes the base for the upgraded card here.
  "icon: s10-1 r1c4 expected 存在感+ got 存在感",
  // A free card read as a card of the deck's plan.
  "icon: s10-g4 r0c2 expected アイドル宣言+ got 止められない想い+",
  // Top screenshot only: the 重複 card repeats one in the third row, which
  // isn't on screen, so it is held to the wrong shown card.
  "icon: s10-d0 r0c3 expected ワクワクが止まらない+ got 成長痛+",
  // Shown score 14; the inferred customizations predict 19.
  "customization: s10-g5 r0c5 inferred badges 0,19,,10,delayed shown 0,14,,10",
  // Cost -1 is not read, so the customization with cost 0 is picked.
  "customization: s7-g5 r0c2 inferred badges 2,,,0,growth shown 2,,,1",
]);

const args = process.argv.slice(2);
const VISUALIZE = args.includes("--visualize");
const DIGITS = args.includes("--digits");
const PRINT = args.includes("--print");

function loadFixture() {
  return readFileSync(FIXTURE_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

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

async function crop(image, box) {
  return sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .resize(ICON_SIZE, ICON_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
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
  const sums = { stage: {} };
  for (const entry of fixture) {
    const image = await loadImage(join(REPO_ROOT, entry.files[0]));
    const { layouts } = detectIdolRoadLoadout([image]);
    const glyphs = stageGlyphs(image, layouts[0]);
    const digits = String(entry.stage);
    if (glyphs.length !== digits.length) {
      throw new Error(
        `${entry.files[0]}: ${glyphs.length} glyphs for stage ${digits}`,
      );
    }
    addGlyphs(sums, "stage", glyphs, digits);
  }
  writeTemplates(sums, DIGITS_PATH);
}

// Reads one loadout the way the import would.
async function readLoadout(images, pItemModel, skillCardModel) {
  const found = detectIdolRoadLoadout(images);
  const present = found.slots.flat().filter(Boolean);
  const crops = await Promise.all(
    present.map(async (slot) => {
      const pixels = await crop(images[slot.image], slot.box);
      return slot.greyed ? liftGreyedOut(pixels) : pixels;
    }),
  );
  const ids = await classifyCrops(
    ort,
    skillCardModel.session,
    skillCardModel.classes,
    crops,
    3,
    undefined,
    idolRoadCardFilter(found.slots).refine,
  );
  const cards = readIdolRoadCards(images, found.slots, ids);
  const [fixed, ...chosen] = found.pItemBoxes;
  const chosenBoxes = chosen.filter(Boolean);
  const chosenIds = await classifyCrops(
    ort,
    pItemModel.session,
    pItemModel.classes,
    await Promise.all(chosenBoxes.map((box) => crop(images[0], box))),
    3,
  );
  return {
    found,
    stage: found.stage,
    params: found.params,
    percents: found.percents,
    fixedShown: !!fixed,
    pItems: [null, ...chosen.map((box) => (box ? chosenIds.shift() : 0))],
    ...cards,
  };
}

const pItemName = (id) => (id ? PItems.getById(id)?.name || `#${id}` : "-");
const cardName = (id) => (id ? SkillCards.getById(id)?.name || `#${id}` : "-");

async function main() {
  const fixture = loadFixture();
  if (DIGITS) {
    await buildDigitTemplates(fixture);
    return;
  }

  const [pItemModel, skillCardModel] = await Promise.all([
    loadModel("p_item"),
    loadModel("skill_card"),
  ]);

  let iconSlots = 0;
  let badgeCards = 0;
  let unreadBadges = 0;
  const iconErrors = [];
  const misreadBadges = [];
  const inconsistentCards = [];
  const failures = [];
  for (const entry of fixture) {
    const name = parse(entry.files[0]).name;
    const images = await Promise.all(
      entry.files.map((file) => loadImage(join(REPO_ROOT, file))),
    );
    let read;
    try {
      read = await readLoadout(images, pItemModel, skillCardModel);
    } catch (err) {
      failures.push(`${name} threw: ${err.message}`);
      continue;
    }
    const slots = read.found.slots;

    if (PRINT) {
      const badges = slots.map((row) =>
        row.map((slot) => {
          if (!slot || slot.greyed) return null;
          const b = readBadges(images[slot.image], slot.box, CONTEST_LAYOUT);
          return [b.dot, b.score, b.genki, b.cost];
        }),
      );
      const { stage, params, percents, fixedShown, pItems, skillCards, duplicates } = read;
      console.log(
        JSON.stringify({ files: entry.files, stage, params, percents, fixedShown, pItems, skillCards, duplicates, badges }),
      );
    }

    for (const key of ["stage", "params", "percents", "fixedShown"]) {
      if (JSON.stringify(read[key]) !== JSON.stringify(entry[key])) {
        failures.push(
          `${name} ${key} expected ${JSON.stringify(entry[key])} got ${JSON.stringify(read[key])}`,
        );
      }
    }
    if (entry.skillCards.length !== read.skillCards.length) {
      failures.push(
        `${name} ${read.skillCards.length} deck rows, labeled ${entry.skillCards.length}`,
      );
      continue;
    }
    if (JSON.stringify(read.duplicates) !== JSON.stringify(entry.duplicates)) {
      failures.push(
        `${name} 重複 expected ${JSON.stringify(entry.duplicates)} got ${JSON.stringify(read.duplicates)}`,
      );
    }

    entry.pItems.slice(1).forEach((id, i) => {
      if (id === null) return;
      iconSlots++;
      if (read.pItems[i + 1] !== id) {
        iconErrors.push(
          `${name} pItems[${i + 1}] expected ${pItemName(id)} got ${pItemName(read.pItems[i + 1])}`,
        );
      }
    });
    entry.skillCards.forEach((row, r) =>
      row.forEach((id, c) => {
        if (id === null) return;
        iconSlots++;
        const got = read.skillCards[r][c];
        if (got !== id) {
          iconErrors.push(
            `${name} r${r}c${c} expected ${cardName(id)} got ${cardName(got)}`,
          );
          return;
        }
        const label = entry.badges[r][c];
        const slot = slots[r][c];
        if (!label || !slot || slot.greyed) return;
        const badges = readBadges(images[slot.image], slot.box, CONTEST_LAYOUT);
        const result = compareBadges(`${name} r${r}c${c}`, id, badges, label);
        badgeCards++;
        unreadBadges += result.unread;
        misreadBadges.push(...result.misread);
        if (result.inconsistent) inconsistentCards.push(result.inconsistent);
      }),
    );

    if (VISUALIZE) {
      for (const [i, image] of images.entries()) {
        await writeOverlay(image, parse(entry.files[i]).name, [
          ...(i === 0 ? read.found.pItemBoxes.map((b) => [b, "orange"]) : []),
          ...slots
            .flat()
            .filter((s) => s && s.image === i)
            .map((s) => [s.box, s.greyed ? "grey" : "red"]),
        ]);
      }
    }
  }

  const misses = [
    ...iconErrors.map((error) => `icon: ${error}`),
    ...misreadBadges.map((misread) => `badge: ${misread}`),
    ...inconsistentCards.map((card) => `customization: ${card}`),
  ];
  const newMisses = misses.filter((miss) => !KNOWN.has(miss));
  const fixed = [...KNOWN].filter((miss) => !misses.includes(miss));
  for (const miss of misses) console.log(`  ${miss}${KNOWN.has(miss) ? " (known)" : ""}`);
  for (const miss of fixed) console.error(`✗ now right, remove from KNOWN: ${miss}`);
  for (const failure of failures) console.error(`✗ ${failure}`);
  console.log(
    `\n${fixture.length} loadouts, icons ${iconSlots - iconErrors.length}/${iconSlots}, ` +
      `${failures.length} wrong stage/stats/slots\n` +
      `${badgeCards} cards: ${misreadBadges.length} misread / ${unreadBadges} unread badges, ` +
      `customizations match shown badges on ${badgeCards - inconsistentCards.length}`,
  );
  if (failures.length || newMisses.length || fixed.length) process.exit(1);
}

await main();
