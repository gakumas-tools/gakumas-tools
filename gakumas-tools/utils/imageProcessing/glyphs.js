export function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return [h * 60, max ? delta / max : 0, max];
}

const GLYPH_WIDTH = 10;
const GLYPH_HEIGHT = 14;

export function maskOf({ data, width }, area, predicate) {
  const w = Math.max(0, area.x1 - area.x0);
  const h = Math.max(0, area.y1 - area.y0);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((area.y0 + y) * width + area.x0 + x) * 4;
      mask[y * w + x] = predicate(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
    }
  }
  return { mask, w, h };
}

function lastRun(glyphs) {
  const height = (g) => g.y1 - g.y0 + 1;
  let start = glyphs.length - 1;
  while (
    start > 0 &&
    glyphs[start].x0 - glyphs[start - 1].x1 <=
      0.8 * Math.max(height(glyphs[start]), height(glyphs[start - 1]))
  ) {
    start--;
  }
  return glyphs.slice(start);
}

export function segmentGlyphs(imageData, area, predicate, rightmost = false) {
  const { mask, w, h } = maskOf(imageData, area, predicate);
  const glyphs = [];
  let glyph = null;
  for (let x = 0; x <= w; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; x < w && y < h; y++) {
      if (mask[y * w + x]) {
        if (top === -1) top = y;
        bottom = y;
      }
    }
    if (top !== -1) {
      if (!glyph) glyph = { x0: x, x1: x, y0: top, y1: bottom };
      glyph.x1 = x;
      glyph.y0 = Math.min(glyph.y0, top);
      glyph.y1 = Math.max(glyph.y1, bottom);
    } else if (glyph) {
      glyphs.push(glyph);
      glyph = null;
    }
  }
  const kept = rightmost ? lastRun(glyphs) : glyphs;
  const tallest = Math.max(0, ...kept.map((g) => g.y1 - g.y0 + 1));
  return kept
    .filter((g) => g.y1 - g.y0 + 1 >= 0.8 * tallest)
    .flatMap((g) => splitTouching(mask, w, g))
    .map((g) => normalizeGlyph(mask, w, g));
}

export function components({ mask, w, h }) {
  const labels = new Int32Array(w * h);
  const found = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const c = { id: found.length + 1, n: 0, x0: w, x1: 0, y0: h, y1: 0 };
    const stack = [start];
    labels[start] = c.id;
    const visit = (q) => {
      if (mask[q] && !labels[q]) {
        labels[q] = c.id;
        stack.push(q);
      }
    };
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    found.push(c);
  }
  return { labels, found };
}

export function componentGlyphs(
  imageData,
  area,
  predicate,
  {
    height: [minHeight, maxHeight],
    interior = false,
    minFill = 0,
    minAspect = 0,
  },
) {
  const masked = maskOf(imageData, area, predicate);
  const { labels, found } = components(masked);
  const height = (c) => c.y1 - c.y0 + 1;
  const width = (c) => c.x1 - c.x0 + 1;
  const touchesEdge = (c) =>
    c.x0 === 0 || c.y0 === 0 || c.x1 === masked.w - 1 || c.y1 === masked.h - 1;
  const sized = found.filter(
    (c) =>
      height(c) >= minHeight &&
      height(c) <= maxHeight &&
      width(c) >= minAspect * height(c) &&
      c.n >= minFill * width(c) * height(c) &&
      !(interior && touchesEdge(c)),
  );
  const tallest = Math.max(0, ...sized.map(height));
  return sized
    .filter((c) => height(c) >= 0.75 * tallest)
    .sort((a, b) => a.x0 - b.x0)
    .flatMap((c) => {
      const only = labels.map((label) => (label === c.id ? 1 : 0));
      return splitTouching(only, masked.w, c).map((g) => ({
        ...normalizeGlyph(only, masked.w, g),
        bounds: {
          x0: area.x0 + g.x0,
          x1: area.x0 + g.x1 + 1,
          y0: area.y0 + g.y0,
          y1: area.y0 + g.y1 + 1,
        },
      }));
    });
}

const MAX_GLYPH_ASPECT = 1.15;

function splitTouching(mask, w, g) {
  const width = g.x1 - g.x0 + 1;
  const height = g.y1 - g.y0 + 1;
  if (width <= MAX_GLYPH_ASPECT * height) return [g];
  let cut = -1;
  let least = Infinity;
  for (
    let x = g.x0 + Math.round(width * 0.3);
    x <= g.x1 - Math.round(width * 0.3);
    x++
  ) {
    let ink = 0;
    for (let y = g.y0; y <= g.y1; y++) ink += mask[y * w + x];
    if (ink < least) {
      least = ink;
      cut = x;
    }
  }
  if (cut === -1) return [g];
  return [
    ...splitTouching(mask, w, { ...g, x1: cut - 1 }),
    ...splitTouching(mask, w, { ...g, x0: cut + 1 }),
  ];
}

export function normalizeGlyph(mask, w, g) {
  const gh = g.y1 - g.y0 + 1;
  const gw = g.x1 - g.x0 + 1;
  const scale = gh / GLYPH_HEIGHT;
  const cellsWide = Math.min(GLYPH_WIDTH, gw / scale);
  const offset = (GLYPH_WIDTH - cellsWide) / 2;
  const out = new Float32Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  for (let cy = 0; cy < GLYPH_HEIGHT; cy++) {
    for (let cx = 0; cx < GLYPH_WIDTH; cx++) {
      const sx0 = g.x0 + (cx - offset) * scale;
      const sy0 = g.y0 + cy * scale;
      let sum = 0;
      let n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + scale); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + scale); sx++) {
          n++;
          if (sx >= g.x0 && sx <= g.x1 && sy >= g.y0 && sy <= g.y1) {
            sum += mask[sy * w + sx];
          }
        }
      }
      out[cy * GLYPH_WIDTH + cx] = n ? sum / n : 0;
    }
  }
  return { pixels: out };
}

export function classifyGlyph(glyph, templates) {
  let best = { digit: null, distance: Infinity };
  for (const [digit, template] of Object.entries(templates)) {
    let distance = 0;
    for (let i = 0; i < template.length; i++) {
      const d = glyph.pixels[i] - template[i];
      distance += d * d;
    }
    if (distance < best.distance) best = { digit, distance };
  }
  return best;
}

export function readNumber(glyphs, templates) {
  if (!glyphs.length) return null;
  return parseInt(
    glyphs.map((g) => classifyGlyph(g, templates).digit).join(""),
    10,
  );
}
