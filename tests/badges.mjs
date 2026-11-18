import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectLoadoutBoxes } from "../gakumas-tools/utils/imageProcessing/contestLoadoutGeometry.js";
import {
  inferCustomizations,
  predictBadges,
} from "../gakumas-tools/utils/inferCustomizations.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTEST_FIXTURE_PATH = join(REPO_ROOT, "tests/contestLoadout.jsonl");
export const BADGE_KEYS = ["dot", "score", "genki", "cost"];
const FONTS = { dot: "dot", score: "dark", genki: "white", cost: "white" };

export async function loadImage(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function loadContestFixture() {
  return readFileSync(CONTEST_FIXTURE_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export async function* labeledContestCards(fixture) {
  for (const entry of fixture) {
    const image = await loadImage(join(REPO_ROOT, entry.file));
    const { mainBoxes, subBoxes } = detectLoadoutBoxes(image);
    const boxes = [...mainBoxes, ...subBoxes];
    const ids = entry.skillCards.flat();
    for (const [i, label] of entry.badges.flat().entries()) {
      if (label && boxes[i]) {
        yield { image, box: boxes[i], label, id: ids[i], file: entry.file };
      }
    }
  }
}

export function addGlyphs(sums, font, glyphs, digits) {
  glyphs.forEach((glyph, i) => {
    const sum = (sums[font][digits[i]] ??= { n: 0, pixels: [] });
    sum.n++;
    glyph.pixels.forEach((v, j) => (sum.pixels[j] = (sum.pixels[j] || 0) + v));
  });
}

export function writeTemplates(sums, path) {
  const templates = {};
  for (const [font, digits] of Object.entries(sums)) {
    templates[font] = {};
    for (const digit of Object.keys(digits).sort()) {
      const { n, pixels } = digits[digit];
      templates[font][digit] = pixels.map(
        (v) => Math.round((v / n) * 100) / 100,
      );
    }
  }
  writeFileSync(path, JSON.stringify(templates) + "\n");
  console.log(`Wrote templates to ${path}`);
}

export function buildBadgeTemplates(samples, path) {
  const sums = { dot: {}, white: {}, dark: {} };
  for (const { glyphs, label } of samples) {
    BADGE_KEYS.forEach((key, k) => {
      const found = glyphs[key];
      if (!found || !label[k]) return;
      const digits = String(label[k]);
      if (found.length === digits.length) {
        addGlyphs(sums, FONTS[key], found, digits);
      }
    });
  }
  writeTemplates(sums, path);
}

export function closestIcon(distances) {
  if (!distances) return null;
  return Object.entries(distances).reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

export function compareBadges(where, cardId, read, label) {
  const misread = [];
  let unread = 0;
  BADGE_KEYS.forEach((key, k) => {
    if (read[key] === undefined) unread++;
    else if (read[key] !== label[k]) {
      misread.push(`${where} ${key} read ${read[key]} shown ${label[k]}`);
    }
  });
  const shownIcon = label[BADGE_KEYS.length];
  const readIcon = closestIcon(read.icon);
  if (shownIcon !== undefined && readIcon !== shownIcon) {
    misread.push(`${where} icon read ${readIcon} shown ${shownIcon}`);
  }
  const predicted = predictBadges(cardId, inferCustomizations(cardId, read));
  const consistent =
    BADGE_KEYS.every((key, k) => predicted[key] === label[k]) &&
    (shownIcon === undefined || predicted.icon === shownIcon);
  return {
    misread,
    unread,
    iconRight:
      label[0] === 0 ? readIcon === predictBadges(cardId).icon : undefined,
    inconsistent: consistent
      ? null
      : `${where} inferred badges ${[...BADGE_KEYS, "icon"].map((key) => predicted[key])} shown ${label}`,
  };
}
