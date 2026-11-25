// Geometry of the Idol Road 「STAGEn スコア獲得編成確認」 popup (ステージ別ランキング →
// 詳細確認): where its stage header, stats, P-items and deck rows are.
//
// The deck is a lattice of columns. Row 1 (the Main memory's cards) fills
// columns 0-5; each later row (one Sub memory's cards) starts with a "+" in
// column 0 and fills columns 1-6. Everything below the score scrolls together
// inside one window, so a second screenshot scrolled to the bottom differs from
// the first by a single y shift.
import {
  findIconRows,
  findIconsInBand,
  leftmostOnLattice,
  median,
  outlineMask,
} from "./contestLoadoutGeometry";

const MIN_CARD_FRAC = 0.1;
const MAX_CARD_FRAC = 0.15;
const PITCH_PER_SIZE = 1.063;
const ROW_PITCH = 1.051;
const CARDS_PER_ROW = 6;
// Column 0's left edge as a share of the screen width; only used to tell
// column 0 from column 1 when the lattice phase is known.
const COLUMN_0_FRAC = 0.062;
const ICON_INSET = 0.02;

// P-items, in deck pitches from row 1's top left.
const P_ITEM_DX = 0.301;
const CHOSEN_DY = -1.037;
const FIXED_DY = -1.89;
const P_ITEM_SIZE = 0.713;
const P_ITEM_PITCH = 0.772;
const CHOSEN_SLOTS = 4;

// The scroll window's background and the white above and below it.
function isWindowGrey(r, g, b) {
  const max = Math.max(r, g, b);
  return max < 246 && max > 200 && max - Math.min(r, g, b) < 12;
}

function isWhite(r, g, b) {
  return Math.min(r, g, b) >= 248;
}

function pixel({ data, width }, x, y) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

// The scroll window's top and bottom, read down the column just left of the
// deck, from a row's middle out to the white panel parts around it.
function findWindow(imageData, x, y) {
  const { height } = imageData;
  const cx = Math.max(0, Math.round(x));
  let top = Math.round(y);
  while (top > 0 && !isWhite(...pixel(imageData, cx, top - 1))) top--;
  let bottom = Math.round(y);
  while (bottom < height - 1 && !isWhite(...pixel(imageData, cx, bottom + 1)))
    bottom++;
  return { top, bottom: bottom + 1 };
}

// Share of a box that is plain window background: an empty slot, or the "+"
// that starts a Sub row.
export function backgroundShare(imageData, box) {
  let plain = 0;
  let total = 0;
  const step = Math.max(1, Math.round(box.width / 32));
  for (let y = box.y; y < box.y + box.height; y += step) {
    for (let x = box.x; x < box.x + box.width; x += step) {
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height)
        continue;
      total++;
      if (isWindowGrey(...pixel(imageData, x, y))) plain++;
    }
  }
  return total ? plain / total : 1;
}

// An empty P-item slot is one flat grey.
export function isEmptySlot(imageData, box) {
  const inner = {
    x: Math.round(box.x + 0.2 * box.width),
    y: Math.round(box.y + 0.2 * box.height),
    width: Math.round(0.6 * box.width),
    height: Math.round(0.6 * box.height),
  };
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = inner.y; y < inner.y + inner.height; y += 2) {
    for (let x = inner.x; x < inner.x + inner.width; x += 2) {
      const [r, g, b] = pixel(imageData, x, y);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      n++;
      sum += luma + chroma;
      sumSq += (luma + chroma) ** 2;
    }
  }
  const mean = sum / n;
  return Math.sqrt(sumSq / n - mean * mean) < 6;
}

function estimatePitch(rows, size) {
  const expected = PITCH_PER_SIZE * size;
  const pitches = [];
  for (const row of rows) {
    for (let i = 1; i < row.icons.length; i++) {
      const d = row.icons[i].x - row.icons[i - 1].x;
      const steps = Math.round(d / expected);
      if (steps < 1) continue;
      const p = d / steps;
      if (Math.abs(p - expected) <= 0.05 * expected) pitches.push(p);
    }
  }
  return pitches.length ? median(pitches) : expected;
}

// A row's top edge: the outline search can lose a row's top to the numbers
// drawn over the cards' frames, so the frame top is found by scanning down
// from the window grey between it and the row above, in the middle of each
// card.
function refineRowY(imageData, window, y, xs, size) {
  const from = Math.round(y - 0.25 * size);
  const to = Math.round(y + 0.25 * size);
  if (from < window.top || to >= window.bottom) return y;
  const tops = [];
  for (const left of xs) {
    for (const f of [0.35, 0.5, 0.65]) {
      const x = Math.round(left + f * size);
      for (let yy = from + 1; yy <= to; yy++) {
        if (!isWindowGrey(...pixel(imageData, x, yy - 1))) continue;
        let solid = true;
        for (let k = 0; k < 4 && solid; k++) {
          solid = !isWindowGrey(...pixel(imageData, x, yy + k));
        }
        if (solid) {
          tops.push(yy);
          break;
        }
      }
    }
  }
  return tops.length >= 3 ? median(tops) : y;
}

function inset(x, y, size) {
  const d = size * ICON_INSET;
  return {
    x: Math.round(x + d),
    y: Math.round(y + d),
    width: Math.round(size - 2 * d),
    height: Math.round(size - 2 * d),
  };
}

// Finds the deck rows on one screenshot. Each row: its top y, whether it is
// a Sub ("+") row, its 6 card boxes (null for an empty slot) and whether the
// scroll window shows all of it.
export function detectIdolRoadBoxes(imageData) {
  const { width, height } = imageData;
  const mask = outlineMask(imageData);
  const found = findIconRows(mask, width, {
    yMin: 0,
    yMax: height,
    minSize: width * MIN_CARD_FRAC,
    maxSize: width * MAX_CARD_FRAC,
  }).filter((r) => r.icons.length >= 3);
  if (!found.length) {
    throw new Error(
      "Could not locate the deck. Is this an Idol Road スコア獲得編成確認 screenshot?",
    );
  }
  // Deck rows sit on the scroll window's grey; the blurred ranking behind the
  // popup can look like a row of icons too.
  const onWindow = found.filter((r) => {
    const x = Math.round(r.icons[0].x - 0.05 * r.size);
    const y = Math.round(r.y + 0.1 * r.size);
    return x >= 0 && isWindowGrey(...pixel(imageData, x, y));
  });
  if (!onWindow.length) {
    throw new Error(
      "Could not locate the deck. Is this an Idol Road スコア獲得編成確認 screenshot?",
    );
  }
  const size = median(onWindow.map((r) => r.size));
  const cardRows = onWindow.filter(
    (r) => Math.abs(r.size - size) <= 0.06 * size,
  );
  const pitch = estimatePitch(cardRows, size);
  const phase = leftmostOnLattice(
    cardRows.flatMap((r) => r.icons),
    pitch,
  );
  const x0 =
    phase + Math.round((COLUMN_0_FRAC * width - phase) / pitch) * pitch;
  const window = findWindow(
    imageData,
    x0 - 0.05 * pitch,
    cardRows[0].y + size / 2,
  );

  // Rows sit on a lattice too; a row the outline search missed (mostly
  // greyed out, or clipped by the window) is still read at its lattice place.
  const rowPitch = ROW_PITCH * pitch;
  // The first row found is the top deck row on screen: above it are the
  // P-items, or the window's edge.
  const anchor = cardRows[0].y;
  const rows = [];
  let next = anchor;
  for (let k = 0; ; k++) {
    const lattice = Math.round(next);
    if (lattice + size * 0.5 > window.bottom) break;
    next += rowPitch;
    const columns = (plus) =>
      Array.from(
        { length: CARDS_PER_ROW },
        (_, i) => x0 + (i + (plus ? 1 : 0)) * pitch,
      ).filter((x) => x + size <= width);
    const plusAt = (yy) =>
      backgroundShare(imageData, clip(inset(x0, yy, size), window)) >= 0.5;
    const y = refineRowY(imageData, window, lattice, columns(plusAt(lattice)), size);
    next = y + rowPitch;
    const visible = y >= window.top - 2 && y + size <= window.bottom + 0.05 * size;
    const column0 = inset(x0, y, size);
    const detected = cardRows.find((r) => Math.abs(r.y - y) <= 0.15 * size);
    const icons = detected
      ? detected.icons
      : findIconsInBand(mask, width, Math.max(0, y), size);
    const boxes = (plus) =>
      Array.from({ length: CARDS_PER_ROW }, (_, i) => {
        const box = inset(x0 + (i + (plus ? 1 : 0)) * pitch, y, size);
        return box.x + box.width <= width + 0.1 * box.width &&
          backgroundShare(imageData, clip(box, window)) < 0.6
          ? box
          : null;
      });
    // An empty lattice row (past the deck's end) has no cards at all.
    const plus = backgroundShare(imageData, clip(column0, window)) >= 0.5;
    const rowBoxes = boxes(plus);
    if (!rowBoxes.some(Boolean) && !icons.length) continue;
    rows.push({ y, plus, boxes: rowBoxes, visible });
  }
  const main = rows.find((r) => !r.plus);
  return {
    size,
    pitch,
    x0,
    window,
    rows,
    mainRow: main ? { x: x0, y: main.y, size, pitch } : null,
    pItemBoxes: main ? pItemBoxes(imageData, mask, main.y, x0, pitch) : null,
  };
}

function clip(box, window) {
  const y0 = Math.max(box.y, window.top);
  const y1 = Math.min(box.y + box.height, window.bottom);
  return { ...box, y: y0, height: Math.max(0, y1 - y0) };
}

// [固定, chosen 1-4]; null for an empty slot.
function pItemBoxes(imageData, mask, mainY, x0, pitch) {
  const size = P_ITEM_SIZE * pitch;
  let x = x0 + P_ITEM_DX * pitch;
  let chosenY = mainY + CHOSEN_DY * pitch;
  const [row] = findIconRows(mask, imageData.width, {
    yMin: Math.max(0, Math.round(chosenY - 0.15 * pitch)),
    yMax: Math.round(chosenY + size + 0.15 * pitch),
    minSize: 0.9 * size,
    maxSize: 1.1 * size,
  });
  const itemPitch = P_ITEM_PITCH * pitch;
  if (row) {
    const left = leftmostOnLattice(row.icons, itemPitch);
    x = left + Math.round((x - left) / itemPitch) * itemPitch;
    chosenY = row.y;
  }
  const fixedY = chosenY + (FIXED_DY - CHOSEN_DY) * pitch;
  const slot = (bx, by) => {
    const box = {
      x: Math.round(bx),
      y: Math.round(by),
      width: Math.round(size),
      height: Math.round(size),
    };
    return box.y >= 0 && !isEmptySlot(imageData, box) ? box : null;
  };
  return [
    slot(x, fixedY),
    ...Array.from({ length: CHOSEN_SLOTS }, (_, i) =>
      slot(x + i * itemPitch, chosenY),
    ),
  ];
}

function rowDifference(a, rowA, b, rowB) {
  let diff = 0;
  let n = 0;
  rowA.boxes.forEach((boxA, i) => {
    const boxB = rowB.boxes[i];
    if (!boxA || !boxB) return;
    const step = Math.max(1, Math.round(boxA.width / 16));
    for (let dy = 0; dy < boxA.height; dy += step) {
      for (let dx = 0; dx < boxA.width; dx += step) {
        const [r1, g1, b1] = pixel(a, boxA.x + dx, boxA.y + dy);
        const [r2, g2, b2] = pixel(b, boxB.x + dx, boxB.y + dy);
        diff += Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        n++;
      }
    }
  });
  return n ? diff / (3 * n) : Infinity;
}

// Joins the rows of the top screenshot and the one scrolled to the bottom
// into the one deck. The shift is the one under which the rows both show
// look alike; each deck row is read from the screenshot that shows it whole
// (the bottom one when both do). Returns rows in deck order as
// { image: 0 | 1, row }.
export function stitchIdolRoadRows(images, layouts) {
  const [top, bottom] = layouts;
  if (!bottom) return top.rows.map((row) => ({ image: 0, row }));
  const tolerance = 0.2 * top.size;
  let best = null;
  for (const a of top.rows) {
    for (const b of bottom.rows) {
      if (a.plus !== b.plus || !a.visible || !b.visible) continue;
      const shift = a.y - b.y;
      const pairs = bottom.rows
        .map((rb) => [top.rows.find((ra) => Math.abs(ra.y - rb.y - shift) <= tolerance), rb])
        .filter(([ra, rb]) => ra && ra.visible && rb.visible && ra.plus === rb.plus);
      const score =
        pairs.reduce((s, [ra, rb]) => s + rowDifference(images[0], ra, images[1], rb), 0) /
        pairs.length;
      if (!best || score < best.score) best = { shift, score };
    }
  }
  if (!best) {
    throw new Error("The two screenshots show no deck row in common");
  }
  const merged = top.rows.map((row) => ({ image: 0, row, at: row.y }));
  for (const row of bottom.rows) {
    const at = row.y + best.shift;
    const same = merged.findIndex((m) => Math.abs(m.at - at) <= tolerance);
    if (same === -1) merged.push({ image: 1, row, at });
    else if (row.visible || !merged[same].row.visible)
      merged[same] = { image: 1, row, at };
  }
  return merged.sort((a, b) => a.at - b.at).map(({ image, row }) => ({ image, row }));
}
