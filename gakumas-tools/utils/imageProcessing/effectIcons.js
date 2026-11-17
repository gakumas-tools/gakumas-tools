import ICON_TEMPLATES from "./effectIconTemplates.json";
import { hsv } from "./glyphs";

const ICON_GRID = 24;
const MIN_SCORE = 0.3;

function isIconFill(h, s, v) {
  return (
    s > 0.5 &&
    v > 150 &&
    ((h >= 185 && h <= 215) || (h >= 18 && h <= 45) || (h >= 80 && h <= 150))
  );
}

const WHITE = 0;
const BLUE = 1;
const ORANGE = 2;
const GREEN = 3;
const OTHER = 4;

function colorClass(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (s < 0.25 && v > 190) return WHITE;
  if (s > 0.35 && h >= 170 && h <= 225) return BLUE;
  if (s > 0.35 && h >= 12 && h <= 50) return ORANGE;
  if (s > 0.35 && h >= 70 && h <= 160) return GREEN;
  return OTHER;
}

function pixel({ data, width }, x, y) {
  const i = (Math.round(y) * width + Math.round(x)) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function diamondScore(imageData, cx, cy, half) {
  let inside = 0;
  let insidePalette = 0;
  let insideIcon = 0;
  let outside = 0;
  let outsidePalette = 0;
  let outsideIcon = 0;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) {
        continue;
      }
      const [h, s, v] = hsv(...pixel(imageData, x, y));
      const palette = isIconFill(h, s, v);
      const icon = palette || (s < 0.2 && v > 215);
      const d = (Math.abs(dx) + Math.abs(dy)) / half;
      if (d < 0.7) {
        inside++;
        insidePalette += palette;
        insideIcon += icon;
      } else if (d > 1.25) {
        outside++;
        outsidePalette += palette;
        outsideIcon += icon;
      }
    }
  }
  if (!inside || insidePalette / inside < 0.2) return 0;
  const corners = Math.max(1, outside);
  return Math.max(
    insideIcon / inside - outsideIcon / corners,
    insidePalette / inside - outsidePalette / corners,
  );
}

export function findBottomIcon(imageData, box, { x, half, bottom }) {
  const cx = box.x + x * box.width;
  const h = half * box.width;
  let best = { score: 0 };
  for (
    let y = box.y + bottom[0] * box.height;
    y <= box.y + bottom[1] * box.height;
    y++
  ) {
    const score = diamondScore(imageData, cx, y, h);
    if (score > best.score) best = { score, y };
  }
  if (best.score < MIN_SCORE) return null;
  return { x0: cx - h, y0: best.y - h, size: 2 * h };
}

export function iconColors(imageData, { x0, y0, size }) {
  const colors = new Uint8Array(ICON_GRID * ICON_GRID);
  for (let y = 0; y < ICON_GRID; y++) {
    for (let x = 0; x < ICON_GRID; x++) {
      const px = Math.min(
        imageData.width - 1,
        Math.max(0, x0 + ((x + 0.5) * size) / ICON_GRID),
      );
      const py = Math.min(
        imageData.height - 1,
        Math.max(0, y0 + ((y + 0.5) * size) / ICON_GRID),
      );
      colors[y * ICON_GRID + x] = colorClass(...pixel(imageData, px, py));
    }
  }
  return colors;
}

const INNER = [];
for (let y = 0; y < ICON_GRID; y++) {
  for (let x = 0; x < ICON_GRID; x++) {
    const c = (ICON_GRID - 1) / 2;
    if ((Math.abs(x - c) + Math.abs(y - c)) / (ICON_GRID / 2) < 0.6) {
      INNER.push(y * ICON_GRID + x);
    }
  }
}

// Memory screens place the icon up to 3 cells off where the diamond search
// centers it, so a template may sit that far up or down.
const SHIFTS = [];
for (let sy = -3; sy <= 3; sy++) {
  for (let sx = -1; sx <= 1; sx++) {
    SHIFTS.push(INNER.map((i) => i + sy * ICON_GRID + sx));
  }
}

export function iconDistance(a, b) {
  let best = INNER.length;
  for (const shifted of SHIFTS) {
    let mismatched = 0;
    for (let k = 0; k < INNER.length; k++) {
      if (a[INNER[k]] !== b[shifted[k]]) mismatched++;
    }
    if (mismatched < best) best = mismatched;
  }
  return best / INNER.length;
}

const decodeIcon = (map) => Uint8Array.from(map, (c) => c.charCodeAt(0) - 48);

const TEMPLATES = Object.entries(ICON_TEMPLATES).map(([type, maps]) => [
  type,
  maps.map(decodeIcon),
]);

function iconDistances(colors) {
  const distances = {};
  for (const [type, maps] of TEMPLATES) {
    let best = Infinity;
    for (const map of maps) best = Math.min(best, iconDistance(colors, map));
    distances[type] = best;
  }
  return distances;
}

// Every effect icon has a white glyph on its diamond. A card with no icon can
// still show a diamond of plain frame color (the basic cards' orange corner),
// which has none.
const MIN_GLYPH = 0.01;

export function hasGlyph(colors) {
  const white = INNER.filter((i) => colors[i] === WHITE).length;
  return white / INNER.length >= MIN_GLYPH;
}

export function readBottomIcon(imageData, box, layout) {
  const icon = findBottomIcon(imageData, box, layout);
  if (!icon) return null;
  const colors = iconColors(imageData, icon);
  return hasGlyph(colors) ? iconDistances(colors) : null;
}
