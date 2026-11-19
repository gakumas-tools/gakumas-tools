// Luminance, not hue: chroma subsampling in JPEGs smears the thin outlines.
function isOutline(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma >= 65 && luma < 175 && Math.max(r, g, b) - Math.min(r, g, b) < 60;
}

function outlineMask({ data, width, height }) {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    mask[p] = isOutline(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
  return mask;
}

const MIN_EDGE_FRAC = 0.035;
const RUN_GAP_FRAC = 0.005;
const ROW_EDGE_FRAC = 0.1;

function horizontalEdgeRows(mask, width, yMin, yMax) {
  const minRun = Math.max(8, Math.round(width * MIN_EDGE_FRAC));
  const RUN_GAP = Math.max(2, Math.round(width * RUN_GAP_FRAC));
  const rows = [];
  for (let y = yMin; y < yMax; y++) {
    let total = 0;
    let runStart = -1;
    let lastOn = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && mask[y * width + x];
      if (on) {
        if (runStart === -1 || x - lastOn > RUN_GAP + 1) {
          if (runStart !== -1 && lastOn - runStart + 1 >= minRun) {
            total += lastOn - runStart + 1;
          }
          runStart = x;
        }
        lastOn = x;
      }
    }
    if (runStart !== -1 && lastOn - runStart + 1 >= minRun) {
      total += lastOn - runStart + 1;
    }
    if (total >= width * ROW_EDGE_FRAC) rows.push(y);
  }
  return groupRuns(rows, 1);
}

function groupRuns(values, tolerance) {
  const groups = [];
  for (const v of values) {
    const last = groups[groups.length - 1];
    if (last && v - last[1] <= tolerance + 1) last[1] = v;
    else groups.push([v, v]);
  }
  return groups;
}

const SIDE_MARGIN = 0.2;
const SIDE_COVERAGE = 0.5;
const SIZE_TOLERANCE = 0.07;

function findIconsInBand(mask, width, top, size) {
  const y0 = Math.round(top + size * SIDE_MARGIN);
  const y1 = Math.round(top + size * (1 - SIDE_MARGIN));
  const needed = (y1 - y0 + 1) * SIDE_COVERAGE;
  const sides = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = y0; y <= y1; y++) count += mask[y * width + x];
    if (count >= needed) sides.push(x);
  }
  const clusters = groupRuns(sides, 1);
  const icons = [];
  let i = 0;
  while (i < clusters.length) {
    const left = clusters[i][0];
    let match = -1;
    for (let j = i + 1; j < clusters.length; j++) {
      const span = clusters[j][1] - left + 1;
      if (span > size * (1 + SIZE_TOLERANCE)) break;
      if (span >= size * (1 - SIZE_TOLERANCE)) match = j;
    }
    if (match === -1) {
      i++;
    } else {
      icons.push({ x: left, width: clusters[match][1] - left + 1 });
      i = match + 1;
    }
  }
  return icons;
}

function findIconRows(mask, width, { yMin, yMax, minSize, maxSize }) {
  const edges = horizontalEdgeRows(mask, width, yMin, yMax);
  const candidates = [];
  for (let a = 0; a < edges.length; a++) {
    for (let b = a + 1; b < edges.length; b++) {
      const size = edges[b][1] - edges[a][0] + 1;
      if (size < minSize) continue;
      if (size > maxSize) break;
      const icons = findIconsInBand(mask, width, edges[a][0], size);
      if (icons.length >= 2) candidates.push({ y: edges[a][0], size, icons });
    }
  }
  candidates.sort((a, b) => b.icons.length - a.icons.length || b.size - a.size);
  const rows = [];
  for (const row of candidates) {
    const overlaps = rows.some(
      (r) => row.y < r.y + r.size && r.y < row.y + row.size,
    );
    if (!overlaps) rows.push(row);
  }
  return rows.sort((a, b) => a.y - b.y);
}

const MIN_CARD_FRAC = 0.04;
const MAX_CARD_FRAC = 0.3;
const MIN_CARD_ROW_ICONS = 3;
const SKILL_CARDS_PER_ROW = 6;
const P_ITEMS_PER_ROW = 4;

const PITCH_PER_SIZE = 1.063;
const SUB_ROW_DY = 1.125;
const SUB_ROW_DX = 1.395;
const P_ITEM_ROW_DY = -1.12;
const P_ITEM_DX = 0.083;
const P_ITEM_PITCH = 0.771;
const P_ITEM_SIZE = 0.75;
// Contest frames are thicker relative to the icon than the reference art.
const ICON_INSET = 0.02;
// The edit view's panel can end partway down the sub row, with the dark stage
// bar over the rest. Half a card misreads, so a card needs this much showing.
const MIN_VISIBLE = 0.75;
const COVER_DARK = 0.9;

function isCover(r, g, b) {
  const max = Math.max(r, g, b);
  return max < 90 && max - Math.min(r, g, b) < 25;
}

// The share of a box above its first fully dark row, the panel's edge. A
// greyed-out card's dark label sits in its top quarter, so the search starts
// below it.
const COVER_SEARCH_FROM = 0.3;

export function visibleFraction({ data, width, height }, box) {
  const x1 = Math.min(width, box.x + box.width);
  const y1 = Math.min(height, box.y + box.height);
  const y0 = Math.round(box.y + COVER_SEARCH_FROM * box.height);
  for (let y = y0; y < y1; y++) {
    let dark = 0;
    for (let x = box.x; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (isCover(data[i], data[i + 1], data[i + 2])) dark++;
    }
    if (dark >= COVER_DARK * (x1 - box.x)) {
      return (y - box.y) / box.height;
    }
  }
  return 1;
}

export function detectLoadoutBoxes(imageData) {
  const { width, height } = imageData;
  const mask = outlineMask(imageData);
  const cards = fitCardLattice(mask, width, height);
  if (!cards) {
    throw new Error(
      "Could not locate the skill card rows. Is this a contest loadout screenshot?",
    );
  }
  const pItems = fitPItemLattice(
    findPItemRows(mask, width, cards.main.y, cards.size).at(-1),
    cards,
  );

  const isCovered = (box) => visibleFraction(imageData, box) < MIN_VISIBLE;
  const slots = ({ x, y, size, pitch }, count, covered = () => false) =>
    Array.from({ length: count }, (_, i) => {
      const inset = size * ICON_INSET;
      const box = {
        x: Math.round(x + i * pitch + inset),
        y: Math.round(y + inset),
        width: Math.round(size - 2 * inset),
        height: Math.round(size - 2 * inset),
      };
      return box.x + box.width / 2 < width &&
        box.y + box.height / 2 < height &&
        !covered(box)
        ? box
        : null;
    });

  return {
    mainRow: cards.main,
    pItemBoxes: slots(pItems, P_ITEMS_PER_ROW),
    mainBoxes: slots(cards.main, SKILL_CARDS_PER_ROW, isCovered),
    subBoxes: slots(cards.sub, SKILL_CARDS_PER_ROW, isCovered),
  };
}

function findPItemRows(mask, width, mainY, size) {
  return findIconRows(mask, width, {
    yMin: Math.max(0, Math.round(mainY + (P_ITEM_ROW_DY - 0.15) * size)),
    yMax: Math.round(mainY - 0.1 * size),
    minSize: size * (P_ITEM_SIZE - 0.1),
    maxSize: size * (P_ITEM_SIZE + 0.1),
  });
}

// The bottom bar can cover the sub row's bottom edge.
function fitCardLattice(mask, width, height) {
  const rows = findIconRows(mask, width, {
    yMin: 0,
    yMax: height,
    minSize: width * MIN_CARD_FRAC,
    maxSize: width * MAX_CARD_FRAC,
  }).filter((r) => r.icons.length >= MIN_CARD_ROW_ICONS);
  if (!rows.length) return null;

  let mainRow = null;
  let subRow = null;
  for (const row of rows) {
    const below = rows.find(
      (r) =>
        Math.abs(r.size - row.size) <= 0.05 * row.size &&
        Math.abs(r.y - row.y - SUB_ROW_DY * row.size) <= 0.15 * row.size,
    );
    if (below) {
      mainRow = row;
      subRow = below;
      break;
    }
  }
  if (!mainRow) {
    const row = rows.reduce((best, r) =>
      r.icons.length > best.icons.length ? r : best,
    );
    if (findPItemRows(mask, width, row.y, row.size).length) {
      mainRow = row;
      subRow = bandRow(
        mask,
        width,
        height,
        row.y + SUB_ROW_DY * row.size,
        row.size,
      );
    } else {
      subRow = row;
      mainRow = bandRow(
        mask,
        width,
        height,
        row.y - SUB_ROW_DY * row.size,
        row.size,
      );
    }
  }

  const size = mainRow.size;
  const pitch = estimatePitch([mainRow, subRow], size);
  const subDx = SUB_ROW_DX * pitch;
  const mainLeft = leftmostOnLattice(mainRow.icons, pitch);
  const subLeft = leftmostOnLattice(subRow.icons, pitch);
  let mainX;
  if (mainLeft === null) {
    mainX = subLeft - subDx;
  } else {
    mainX = mainLeft;
    if (subLeft !== null) {
      const steps = Math.round((subLeft - subDx - mainLeft) / pitch);
      mainX = mainLeft + Math.min(0, steps) * pitch;
    }
  }
  const subX =
    subLeft === null
      ? mainX + subDx
      : subLeft + Math.round((mainX + subDx - subLeft) / pitch) * pitch;
  return {
    size,
    main: { x: mainX, y: mainRow.y, size, pitch },
    sub: { x: subX, y: subRow.y, size, pitch },
  };
}

function bandRow(mask, width, height, y, size) {
  const top = Math.round(y);
  const inside = top >= 0 && top + size <= height;
  return {
    y: top,
    size,
    icons: inside ? findIconsInBand(mask, width, top, size) : [],
  };
}

function fitPItemLattice(row, { size, main }) {
  const pitch = P_ITEM_PITCH * main.pitch;
  const expectedX = main.x + P_ITEM_DX * main.pitch;
  if (!row) {
    return {
      x: expectedX,
      y: main.y + P_ITEM_ROW_DY * size,
      size: P_ITEM_SIZE * size,
      pitch,
    };
  }
  const left = leftmostOnLattice(row.icons, pitch);
  return {
    x: left + Math.round((expectedX - left) / pitch) * pitch,
    y: row.y,
    size: row.size,
    pitch,
  };
}

function estimatePitch(rows, size) {
  const expected = PITCH_PER_SIZE * size;
  const pitches = [];
  for (const row of rows) {
    for (let i = 1; i < row.icons.length; i++) {
      const d = row.icons[i].x - row.icons[i - 1].x;
      const steps = Math.round(d / expected);
      const p = d / steps;
      if (steps >= 1 && Math.abs(p - expected) <= 0.05 * expected)
        pitches.push(p);
    }
  }
  return pitches.length ? median(pitches) : expected;
}

const LATTICE_TOLERANCE = 0.2;

function leftmostOnLattice(icons, pitch) {
  let best = null;
  for (const ref of icons) {
    const offsets = icons
      .map((icon) => {
        const steps = (icon.x - ref.x) / pitch;
        return (steps - Math.round(steps)) * pitch;
      })
      .filter((offset) => Math.abs(offset) <= LATTICE_TOLERANCE * pitch);
    if (!best || offsets.length > best.support) {
      best = { support: offsets.length, phase: ref.x + median(offsets) };
    }
  }
  if (!best) return null;
  const left = Math.min(
    ...icons
      .filter((icon) => {
        const steps = (icon.x - best.phase) / pitch;
        return Math.abs(steps - Math.round(steps)) <= LATTICE_TOLERANCE;
      })
      .map((icon) => icon.x),
  );
  return best.phase + Math.round((left - best.phase) / pitch) * pitch;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
