import BADGE_TEMPLATES from "./cardBadgeDigits.json";
import { inferCustomizations } from "../inferCustomizations";
import { readBottomIcon } from "./effectIcons";
import {
  classifyGlyph,
  componentGlyphs,
  components,
  hsv,
  maskOf,
} from "./glyphs";

export const CONTEST_LAYOUT = {
  digit: [0.08, 0.24],
  scoreDigit: [0.13, 0.28],
  dot: { x: [0.36, 0.7], y: [0.66, 1.06], diameter: [0.17, 0.3] },
  score: { x: [0.03, 0.4], y: [0.03, 0.3] },
  genki: { x: [0.62, 1.02], y: [-0.03, 0.32] },
  cost: { x: [0.62, 1], y: [0.66, 1.08] },
  plainCost: { x: [0.68, 1], y: [0.77, 1] },
  icon: { x: 0.17, half: 0.16, bottom: [0.72, 0.95] },
};

export const MEMORY_LAYOUT = {
  digit: [0.06, 0.22],
  scoreDigit: [0.1, 0.24],
  dot: { x: [0.35, 0.68], y: [0.6, 0.92], diameter: [0.13, 0.25] },
  score: { x: [0.02, 0.4], y: [0.02, 0.27] },
  genki: { x: [0.66, 1.01], y: [-0.01, 0.26] },
  cost: { x: [0.62, 1.01], y: [0.62, 0.93] },
  plainCost: { x: [0.68, 1], y: [0.7, 0.92] },
  icon: { x: 0.125, half: 0.115, bottom: [0.74, 0.9] },
};

const MIN_BADGE_FILL = 0.02;
const BADGE_PAD = 0.04;
const COST_BADGE_PAD = 0.08;
const MAX_DISTANCE = 20;

function isDotGreen(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  return h >= 118 && h <= 165 && s > 0.3 && v > 100;
}

function isShieldBlue(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  return h >= 175 && h <= 215 && s > 0.35 && v > 140;
}

function isHeart(r, g, b) {
  const [h, s] = hsv(r, g, b);
  return s > 0.45 && (h < 20 || h > 330 || (h >= 45 && h <= 172));
}

function isWhite(r, g, b, minLuma = 195) {
  const max = Math.max(r, g, b);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma >= minLuma && max - Math.min(r, g, b) < 0.25 * max;
}

// The cost heart's pale outline passes as white and merges with the last digit.
function isCostWhite(r, g, b) {
  return isWhite(r, g, b, 205);
}

function isBright(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b >= 165;
}

function isDark(r, g, b) {
  const max = Math.max(r, g, b);
  return max < 120 && max - Math.min(r, g, b) < 35;
}

function area(box, { x, y }, { width, height }) {
  return {
    x0: Math.max(0, Math.round(box.x + x[0] * box.width)),
    x1: Math.min(width, Math.round(box.x + x[1] * box.width)),
    y0: Math.max(0, Math.round(box.y + y[0] * box.height)),
    y1: Math.min(height, Math.round(box.y + y[1] * box.height)),
  };
}

function blobs(imageData, region, predicate) {
  return components(maskOf(imageData, region, predicate))
    .found.map((c) => ({
      n: c.n,
      x0: region.x0 + c.x0,
      x1: region.x0 + c.x1 + 1,
      y0: region.y0 + c.y0,
      y1: region.y0 + c.y1 + 1,
    }))
    .sort((a, b) => b.n - a.n);
}

function findDot(imageData, box, { dot }) {
  const [min, max] = dot.diameter.map((d) => d * box.width);
  return blobs(imageData, area(box, dot, imageData), isDotGreen).find(
    ({ x0, x1, y0, y1 }) => {
      const w = x1 - x0;
      const h = y1 - y0;
      return (
        w >= min &&
        w <= max &&
        h >= min &&
        h <= max &&
        w < 1.3 * h &&
        h < 1.3 * w
      );
    },
  );
}

function findBadge(imageData, box, region, color, rightPad = BADGE_PAD) {
  const found = blobs(imageData, area(box, region, imageData), color);
  if (!found.length) return null;
  const parts = found.filter(({ n }) => n >= 0.15 * found[0].n);
  const total = parts.reduce((sum, { n }) => sum + n, 0);
  if (total < MIN_BADGE_FILL * box.width * box.height) return null;
  const pad = Math.round(BADGE_PAD * box.width);
  const right = Math.round(rightPad * box.width);
  return {
    x0: Math.max(0, Math.min(...parts.map((p) => p.x0)) - pad),
    x1: Math.min(imageData.width, Math.max(...parts.map((p) => p.x1)) + right),
    y0: Math.max(0, Math.min(...parts.map((p) => p.y0)) - pad),
    y1: Math.min(imageData.height, Math.max(...parts.map((p) => p.y1)) + pad),
  };
}

function adjacentRun(glyphs, fromRight) {
  const ordered = fromRight ? [...glyphs].reverse() : glyphs;
  const run = ordered.slice(0, 1);
  for (const glyph of ordered.slice(1)) {
    const last = run[run.length - 1].bounds;
    const gap = fromRight
      ? last.x0 - glyph.bounds.x1
      : glyph.bounds.x0 - last.x1;
    if (gap > 0.5 * (last.y1 - last.y0)) break;
    run.push(glyph);
  }
  return fromRight ? run.reverse() : run;
}

// 重複 and 制限 grey a card out and put a dark label with white text at its
// top right.
function isGreyedOut({ data, width, height }, box) {
  let dark = 0;
  let white = 0;
  let total = 0;
  for (
    let y = Math.round(box.y + 0.04 * box.height);
    y < box.y + 0.24 * box.height;
    y++
  ) {
    for (
      let x = Math.round(box.x + 0.4 * box.width);
      x < box.x + 0.96 * box.width;
      x++
    ) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      total++;
      if (max < 95 && max - min < 25) dark++;
      if (min > 215) white++;
    }
  }
  return total > 0 && dark / total >= 0.18 && white / total >= 0.2;
}

export function badgeGlyphs(imageData, box, layout) {
  const white = (region, interior = true, predicate = isWhite) =>
    componentGlyphs(imageData, region, predicate, {
      height: layout.digit.map((d) => d * box.height),
      interior,
      minFill: 0.25,
      minAspect: 0.2,
    });
  const dot = findDot(imageData, box, layout);
  const shield = findBadge(imageData, box, layout.genki, isShieldBlue);
  // A cost's last digit can stick out past the right of its heart.
  const heart = findBadge(imageData, box, layout.cost, isHeart, COST_BADGE_PAD);
  const cost = (predicate) =>
    adjacentRun(
      heart
        ? white(heart, true, predicate)
        : white(area(box, layout.plainCost, imageData), false, predicate),
      true,
    );
  return {
    dot: dot && white(dot, true, isBright),
    score: adjacentRun(
      componentGlyphs(imageData, area(box, layout.score, imageData), isDark, {
        height: layout.scoreDigit.map((d) => d * box.height),
        minFill: 0.3,
        minAspect: 0.25,
      }),
      false,
    ),
    genki: shield && white(shield),
    cost: cost(isCostWhite),
    // The stricter mask can thin an antialiased digit away.
    costFallback: cost(isWhite),
  };
}

export function readBadge(glyphs, templates, fromRight = false) {
  const ordered = fromRight ? [...glyphs].reverse() : glyphs;
  const digits = [];
  for (const glyph of ordered) {
    const { digit, distance } = classifyGlyph(glyph, templates);
    if (distance > MAX_DISTANCE) return undefined;
    digits.push(digit);
  }
  if (!digits.length) return undefined;
  return parseInt((fromRight ? digits.reverse() : digits).join(""), 10);
}

function readDot(glyphs) {
  const size = ({ bounds: b }) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const largest = glyphs.reduce(
    (a, b) => (size(b) > size(a) ? b : a),
    glyphs[0],
  );
  return largest
    ? parseInt(classifyGlyph(largest, BADGE_TEMPLATES.dot).digit, 10)
    : undefined;
}

// null: the badge isn't shown. undefined: shown but unreadable.
export function readBadges(imageData, box, layout) {
  const glyphs = badgeGlyphs(imageData, box, layout);
  return {
    dot: glyphs.dot ? readDot(glyphs.dot) : 0,
    score: glyphs.score.length
      ? readBadge(glyphs.score, BADGE_TEMPLATES.dark)
      : null,
    genki: glyphs.genki ? readBadge(glyphs.genki, BADGE_TEMPLATES.white) : null,
    cost:
      readBadge(glyphs.cost, BADGE_TEMPLATES.white, true) ??
      readBadge(glyphs.costFallback, BADGE_TEMPLATES.white, true),
    icon: readBottomIcon(imageData, box, layout.icon),
  };
}

export function readCustomizations(imageData, box, layout, cardId) {
  if (!box || !cardId || !findDot(imageData, box, layout)) return {};
  return inferCustomizations(cardId, readBadges(imageData, box, layout));
}

// 重複 greys out the main row's first card shared into the sub row; anything
// else greyed out is 制限, which the stage doesn't allow.
export function readLoadoutCards(imageData, boxGroups, idGroups) {
  const greyed = boxGroups.map((boxes) =>
    boxes.map((box) => !!box && isGreyedOut(imageData, box)),
  );
  const shared = greyed[1][0];
  const skillCardIdGroups = idGroups.map((ids, row) =>
    ids.map((id, i) => (greyed[row][i] ? 0 : id)),
  );
  const customizationGroups = skillCardIdGroups.map((ids, row) =>
    ids.map((id, i) =>
      readCustomizations(imageData, boxGroups[row][i], CONTEST_LAYOUT, id),
    ),
  );
  if (shared) {
    skillCardIdGroups[1][0] = skillCardIdGroups[0][0];
    customizationGroups[1][0] = { ...customizationGroups[0][0] };
  }
  return { skillCardIdGroups, customizationGroups };
}
