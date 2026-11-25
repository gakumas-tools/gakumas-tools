// Reads the Idol Road 「STAGEn スコア獲得編成確認」 popup (ステージ別ランキング →
// 詳細確認) into a loadout: stage number, Vo/Da/Vi/体力 with their percents,
// the P-items (固定 first, then the chosen ones) and the deck, one row per
// memory (Main first, then each Sub's "+" row).
//
// Takes the top screenshot and, optionally, one with the deck scrolled to the
// bottom. The pixel work here is pure; identifying icons is the caller's,
// with the classifier models (see idolRoadCardFilter for the card reads).
import { SkillCards } from "gakumas-data";
import DIGIT_TEMPLATES from "./contestLoadoutDigits.json";
import STAGE_TEMPLATES from "./idolRoadDigits.json";
import {
  CONTEST_LAYOUT,
  hasDot,
  isGreyedOut,
  readCustomizations,
} from "./cardBadges";
import { samePlanFilter } from "./entityClassifier";
import {
  classifyGlyph,
  maskOf,
  normalizeGlyph,
  readNumber,
  segmentGlyphs,
} from "./glyphs";
import { detectIdolRoadBoxes, stitchIdolRoadRows } from "./idolRoadGeometry";
import { getOtherVersionId } from "../upgrades";

// In deck pitches from row 1's top left.
const NUMBER_X = [4.4, 5.85];
const PERCENT_X = [5.8, 7.0];
const PANEL_Y = [-3.6, -1.0];
const MIN_LINE_HEIGHT = 0.08;
const STAT_LINES = 4;
// The orange header is above the scroll window.
const HEADER_SEARCH = [-2.6, -0.4];
const HEADER_X = [-0.2, 5];
const HEADER_GLYPH_HEIGHT = 0.15;
const STAGE_PREFIX = "STAGE".length;
const MAX_STAGE_DISTANCE = 25;

function isDarkText(r, g, b) {
  const max = Math.max(r, g, b);
  return max < 110 && max - Math.min(r, g, b) < 30;
}

function isColoredText(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b) > 90;
}

function isHeaderOrange(r, g, b) {
  return r > 200 && b < 150 && r - b > 80;
}

function isHeaderWhite(r, g, b) {
  return Math.min(r, g, b) > 225;
}

function region({ x, y, pitch }, [x0, x1], [y0, y1], { width, height }) {
  return {
    x0: Math.max(0, Math.round(x + x0 * pitch)),
    x1: Math.min(width, Math.round(x + x1 * pitch)),
    y0: Math.max(0, Math.round(y + y0 * pitch)),
    y1: Math.min(height, Math.round(y + y1 * pitch)),
  };
}

function textLines(imageData, area, predicate, minHeight) {
  const { mask, w, h } = maskOf(imageData, area, predicate);
  const lines = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    let on = false;
    for (let x = 0; y < h && x < w && !on; x++) on = mask[y * w + x] === 1;
    if (on && start === -1) start = y;
    if (!on && start !== -1) {
      if (y - start > minHeight) {
        lines.push({ y0: area.y0 + start, y1: area.y0 + y });
      }
      start = -1;
    }
  }
  return lines;
}

export function idolRoadStatGlyphs(imageData, mainRow) {
  const numbers = region(mainRow, NUMBER_X, PANEL_Y, imageData);
  const percents = region(mainRow, PERCENT_X, PANEL_Y, imageData);
  const lines = textLines(
    imageData,
    numbers,
    isDarkText,
    MIN_LINE_HEIGHT * mainRow.pitch,
  ).slice(-STAT_LINES);
  if (lines.length < STAT_LINES) {
    throw new Error("Could not locate the Vo/Da/Vi/体力 values");
  }
  return lines.map((line, i) => {
    const pad = Math.round((line.y1 - line.y0) * 0.3);
    return {
      value: segmentGlyphs(
        imageData,
        { x0: numbers.x0, x1: numbers.x1, y0: line.y0, y1: line.y1 },
        isDarkText,
      ),
      percent:
        i < STAT_LINES - 1
          ? segmentGlyphs(
              imageData,
              {
                x0: percents.x0,
                x1: percents.x1,
                y0: Math.max(0, line.y0 - pad),
                y1: Math.min(imageData.height, line.y1 + pad),
              },
              isColoredText,
              true,
            )
          : null,
    };
  });
}

export function readIdolRoadStats(imageData, mainRow, templates = DIGIT_TEMPLATES) {
  const lines = idolRoadStatGlyphs(imageData, mainRow);
  return {
    params: lines.map((l) => readNumber(l.value, templates.value)),
    percents: lines
      .slice(0, 3)
      .map((l) => readNumber(l.percent, templates.percent)),
  };
}

// The glyphs of the header's first word, 「STAGE10」.
export function stageGlyphs(imageData, { x0, pitch, window }) {
  const area = region(
    { x: x0, y: window.top, pitch },
    HEADER_X,
    HEADER_SEARCH,
    imageData,
  );
  // The header band: rows mostly orange.
  const { mask, w, h } = maskOf(imageData, area, isHeaderOrange);
  let bandTop = -1;
  let bandBottom = -1;
  for (let y = h - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < w; x++) n += mask[y * w + x];
    const orange = n >= 0.4 * w;
    if (orange && bandBottom === -1) bandBottom = y;
    if (orange) bandTop = y;
    else if (bandBottom !== -1 && bandBottom - y > 0.3 * pitch) break;
  }
  if (bandBottom === -1) return [];
  // Column runs, not connected parts: the header's thin strokes break
  // letters into pieces.
  const band = {
    x0: area.x0,
    x1: area.x1,
    y0: area.y0 + bandTop,
    y1: area.y0 + bandBottom + 1,
  };
  const white = maskOf(imageData, band, isHeaderWhite);
  const runs = [];
  for (let x = 0; x <= white.w; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; x < white.w && y < white.h; y++) {
      if (white.mask[y * white.w + x]) {
        if (top === -1) top = y;
        bottom = y;
      }
    }
    const last = runs.at(-1);
    if (top !== -1) {
      if (last && last.open) {
        last.x1 = x;
        last.y0 = Math.min(last.y0, top);
        last.y1 = Math.max(last.y1, bottom);
      } else runs.push({ x0: x, x1: x, y0: top, y1: bottom, open: true });
    } else if (last) last.open = false;
  }
  const minHeight = HEADER_GLYPH_HEIGHT * pitch;
  const glyphs = runs.filter((g) => g.y1 - g.y0 + 1 >= minHeight);
  // The first word ends at the first gap wider than a glyph.
  const word = [];
  for (const glyph of glyphs) {
    const last = word.at(-1);
    if (last && glyph.x0 - last.x1 > 0.8 * (glyph.y1 - glyph.y0)) break;
    word.push(glyph);
  }
  return word
    .slice(STAGE_PREFIX)
    .map((g) => normalizeGlyph(white.mask, white.w, g));
}

// The header's digits are their own font; its templates are built from the
// labeled screens, so a digit none of them shows reads as null.
export function readIdolRoadStage(imageData, layout, templates = STAGE_TEMPLATES) {
  const glyphs = stageGlyphs(imageData, layout);
  if (!glyphs.length) return null;
  const digits = [];
  for (const glyph of glyphs) {
    const { digit, distance } = classifyGlyph(glyph, templates.stage);
    if (distance > MAX_STAGE_DISTANCE) return null;
    digits.push(digit);
  }
  return parseInt(digits.join(""), 10);
}

// Finds everything on one or two screenshots ([top, bottom?]). Stats, stage
// and P-items come from the first; deck rows from whichever shows them whole.
// slots: deck rows of [{ image, box, greyed }] (null for an empty slot).
export function detectIdolRoadLoadout(images) {
  const layouts = images.map((image) => detectIdolRoadBoxes(image));
  const [top] = layouts;
  if (!top.mainRow) {
    throw new Error("The first screenshot must show the top of the deck");
  }
  const stats = readIdolRoadStats(images[0], top.mainRow);
  const rows = stitchIdolRoadRows(images, layouts);
  return {
    stage: readIdolRoadStage(images[0], top),
    ...stats,
    pItemBoxes: top.pItemBoxes,
    slots: rows.map(({ image, row }) =>
      row.boxes.map((box) =>
        box ? { image, box, greyed: isGreyedOut(images[image], box) } : null,
      ),
    ),
    layouts,
  };
}

// 重複 lays a half-black veil over the card. Undoes it on a crop's RGB bytes
// (in place) so the classifier sees the card's own colours.
export function liftGreyedOut(pixels) {
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.min(255, pixels[i] * 2);
  }
  return pixels;
}

// For the card classifier: every card of one memory (row) shares a plan, and
// a 重複 (greyed) card is the same card as one shown in full elsewhere in the
// deck, in an earlier row or a later one. A Sub row's first card is its
// memory's P-idol card, so a greyed one there repeats another row's first
// card. Takes the slots of
// detectIdolRoadLoadout; returns { refine } over its present slots in order.
export function idolRoadCardFilter(slots) {
  const present = slots.flatMap((row, r) =>
    row.flatMap((slot, c) => (slot ? [{ ...slot, row: r, first: c === 0 }] : [])),
  );
  const plans = samePlanFilter(present.map((s) => s.row));
  return {
    refine: (ids) => {
      // A greyed card's first read is unsure, so it takes no part in the
      // vote; it is held to the cards shown in full instead.
      const vote = plans(ids.map((id, i) => (present[i].greyed ? 0 : id)));
      const plan = (id, i) => present[i].greyed || vote(id, i);
      const shown = new Set();
      const shownFirst = new Set();
      present.forEach((slot, j) => {
        if (slot.greyed) return;
        const card = SkillCards.getById(ids[j]);
        const other = card && getOtherVersionId(SkillCards, card);
        for (const set of slot.first ? [shown, shownFirst] : [shown]) {
          set.add(ids[j]);
          if (other) set.add(other);
        }
      });
      return (id, i) => {
        if (!plan(id, i)) return false;
        if (!present[i].greyed) return true;
        const candidates =
          present[i].first && shownFirst.size ? shownFirst : shown;
        return !candidates.size || candidates.has(id);
      };
    },
  };
}

// From the classifier's reads (one per present slot, in order) to the deck:
// skillCards and duplicates as rows, customizations per card. A card with
// customization badges is the upgraded one. A 重複 card keeps its own read
// (it can be the base of an upgraded card shown elsewhere) and takes the
// customizations of the same card shown in full; whether it counts in the
// deck is the caller's call.
export function readIdolRoadCards(images, slots, ids) {
  const queue = [...ids];
  const flat = [];
  const rows = slots.map((row) =>
    row.map((slot) => {
      if (!slot) return null;
      const id = queue.shift();
      const entry = { ...slot, id };
      flat.push(entry);
      return entry;
    }),
  );
  for (const entry of flat) {
    if (entry.greyed) continue;
    const card = SkillCards.getById(entry.id);
    const image = images[entry.image];
    if (card && !card.upgraded && hasDot(image, entry.box, CONTEST_LAYOUT)) {
      entry.id = getOtherVersionId(SkillCards, card) ?? entry.id;
    }
    entry.customizations = readCustomizations(
      image,
      entry.box,
      CONTEST_LAYOUT,
      entry.id,
    );
  }
  for (const entry of flat) {
    if (!entry.greyed) continue;
    const original = flat.find((e) => !e.greyed && e.id === entry.id);
    entry.customizations = { ...(original?.customizations || {}) };
  }
  return {
    skillCards: rows.map((row) => row.map((e) => e?.id ?? 0)),
    duplicates: rows.map((row) => row.map((e) => !!e?.greyed)),
    customizations: rows.map((row) => row.map((e) => e?.customizations ?? {})),
  };
}
