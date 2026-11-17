/**
 * Builds the templates for the bottom effect icon on skill cards
 * (gakumas-tools/utils/imageProcessing/effectIconTemplates.json), and checks
 * them on screens they weren't built from.
 *
 * Samples come from the gk-img card art, the uncustomized cards in the
 * contest loadout fixtures, and the uncustomized cards in the memory fixtures
 * (passed in by `pnpm test:memory --icons`, which reads those screens). Each
 * is labeled with the icon its card's data predicts. The memory screens are
 * needed: at their scale some icons (好印象, 好調, やる気) look closer to
 * another type's art than to their own.
 *
 * Every sample is kept unless one of the same type already kept is within
 * KEEP_DISTANCE of it, art first. The check then reads every fixture card
 * against templates built the same way without its own screen, so the
 * fixtures don't grade themselves.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SkillCards } from "gakumas-data";
import { predictBadges } from "../gakumas-tools/utils/inferCustomizations.js";
import { CONTEST_LAYOUT } from "../gakumas-tools/utils/imageProcessing/cardBadges.js";
import {
  findBottomIcon,
  hasGlyph,
  iconColors,
  iconDistance,
} from "../gakumas-tools/utils/imageProcessing/effectIcons.js";
import { labeledContestCards, loadContestFixture, loadImage } from "./badges.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = join(REPO_ROOT, "gk-img/docs/skill_cards/icons");
const OUT_PATH = join(
  REPO_ROOT,
  "gakumas-tools/utils/imageProcessing/effectIconTemplates.json",
);
const GALLERY_LAYOUT = { x: 0.125, half: 0.115, bottom: [0.76, 0.92] };
const KEEP_DISTANCE = 0.12;

export function iconSample(image, box, layout, cardId, screen) {
  const type = predictBadges(cardId).icon;
  if (!type || type.startsWith("other:")) return null;
  const icon = findBottomIcon(image, box, layout);
  if (!icon) return null;
  const colors = iconColors(image, icon);
  return hasGlyph(colors) ? { type, colors, screen, cardId } : null;
}

async function gallerySamples() {
  const files = readdirSync(ICON_DIR);
  const samples = [];
  for (const card of SkillCards.getAll()) {
    const file = files.find(
      (f) => f === `${card.id}.webp` || f === `${card.id}_1.webp`,
    );
    if (!file) continue;
    const image = await loadImage(join(ICON_DIR, file));
    const box = { x: 0, y: 0, width: image.width, height: image.height };
    samples.push(iconSample(image, box, GALLERY_LAYOUT, card.id, null));
  }
  return samples.filter(Boolean);
}

async function contestSamples() {
  const samples = [];
  for await (const { image, box, label, id, file } of labeledContestCards(
    loadContestFixture(),
  )) {
    if (label[0] === 0) {
      samples.push(iconSample(image, box, CONTEST_LAYOUT.icon, id, file));
    }
  }
  return samples.filter(Boolean);
}

function keep(kept, samples) {
  const out = [...kept];
  for (const s of samples) {
    const near = out.some(
      (k) =>
        k.type === s.type && iconDistance(s.colors, k.colors) <= KEEP_DISTANCE,
    );
    if (!near) out.push(s);
  }
  return out;
}

function closest(templates, colors) {
  let best = { type: null, distance: Infinity };
  for (const t of templates) {
    const distance = iconDistance(colors, t.colors);
    if (distance < best.distance) best = { type: t.type, distance };
  }
  return best;
}

function leaveOneScreenOut(art, fixtures) {
  const screens = [...new Set(fixtures.map((s) => s.screen))];
  const misses = [];
  for (const screen of screens) {
    const templates = keep(
      art,
      fixtures.filter((s) => s.screen !== screen),
    );
    for (const s of fixtures.filter((f) => f.screen === screen)) {
      const { type, distance } = closest(templates, s.colors);
      if (type !== s.type) {
        misses.push(
          `${screen} card ${s.cardId}: ${s.type} read ${type} (${distance.toFixed(2)})`,
        );
      }
    }
  }
  return misses;
}

const encode = (colors) =>
  String.fromCharCode(...Array.from(colors, (c) => c + 48));

export async function buildIconTemplates(memorySamples) {
  const art = keep([], await gallerySamples());
  const fixtures = [...(await contestSamples()), ...memorySamples];
  const templates = keep(art, fixtures);

  const out = {};
  for (const { type, colors } of templates) {
    (out[type] ||= []).push(encode(colors));
  }
  writeFileSync(OUT_PATH, JSON.stringify(out) + "\n");
  console.log(
    `${templates.length} templates of ${Object.keys(out).length} types → ${OUT_PATH}`,
  );

  const misses = leaveOneScreenOut(art, fixtures);
  for (const m of misses) console.log(`  ${m}`);
  const count = (pred) => fixtures.filter((s) => pred(s.screen)).length;
  const missed = (pred) => misses.filter((m) => pred(m.split(" ")[0])).length;
  const isMemory = (screen) => screen.includes("/memory/");
  for (const [name, pred] of [
    ["contest", (s) => !isMemory(s)],
    ["memory", isMemory],
  ]) {
    const n = count(pred);
    console.log(
      `Leave one screen out, ${name}: ${n - missed(pred)}/${n} icons right`,
    );
  }
}
