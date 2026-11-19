import { PIdols, SkillCards } from "gakumas-data";
import { getOtherVersionId } from "../upgrades";

// Reading the skill cards the nav pill covers (findNavPill). The pill is
// frosted glass: what's under it is blurred past reading, so the classifier,
// which sees the whole card, reads them wrong. What still shows is the top of
// the card (its art, score and genki badges) and, below the pill, the plan
// icon and cost heart. Those parts alone are compared with every card icon
// gk-img has, shrunk to THUMB_SIZE (cardThumbs.json, built by
// `pnpm test:memory --thumbs`), and the displayed total settles a card from
// its + version, which differ only in what the pill covers.

export const THUMB_SIZE = 12;
// A card counts as covered once this much of it is under the pill or past the
// screen's bottom edge.
const MIN_COVERED = 0.2;
// The pill's blurred edge reaches a little past the grey band.
const PILL_MARGIN = 2;
// A cell is compared only if this much of it shows.
const MIN_CELL_SHOWN = 0.8;
// An empty slot shows plain page background: its pixels hardly vary, where a
// card's top strip varies by 25 or more (out of 255).
const EMPTY_SPREAD = 8;
// The candidates kept per covered card, and how far behind the best they may
// be, before the displayed total picks among them.
const KEEP = 4;
const KEEP_WITHIN = 3;

function hidden(x, y, pill, height) {
  return (
    y >= height ||
    (y >= pill.top - PILL_MARGIN &&
      y < pill.bottom + PILL_MARGIN &&
      x >= pill.left - PILL_MARGIN &&
      x < pill.right + PILL_MARGIN)
  );
}

export function coveredFraction(box, pill, height) {
  const area = (x0, x1, y0, y1) => Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  const underPill = area(
    Math.max(box.x, pill.left),
    Math.min(x1, pill.right),
    Math.max(box.y, pill.top),
    Math.min(y1, pill.bottom, height),
  );
  const offScreen = area(box.x, x1, Math.max(box.y, height), y1);
  return (underPill + offScreen) / (box.width * box.height);
}

// The box shrunk to THUMB_SIZE cells, each the mean of its pixels that show;
// mask marks the cells that mostly show.
export function sampleShown({ data, width, height }, box, pill) {
  const channels = Math.round(data.length / (width * height));
  const S = THUMB_SIZE;
  const pixels = new Float32Array(S * S * 3);
  const mask = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const sum = [0, 0, 0];
      let shown = 0;
      let all = 0;
      const ys = Math.floor(box.y + (j * box.height) / S);
      const xs = Math.floor(box.x + (i * box.width) / S);
      for (let y = ys; y < box.y + ((j + 1) * box.height) / S; y++) {
        for (let x = xs; x < box.x + ((i + 1) * box.width) / S; x++) {
          all++;
          if (x < 0 || y < 0 || x >= width || hidden(x, y, pill, height))
            continue;
          const o = (y * width + x) * channels;
          for (let c = 0; c < 3; c++) sum[c] += data[o + c];
          shown++;
        }
      }
      if (shown < all * MIN_CELL_SHOWN) continue;
      mask[j * S + i] = 1;
      for (let c = 0; c < 3; c++) pixels[(j * S + i) * 3 + c] = sum[c] / shown;
    }
  }
  return { pixels, mask };
}

// How much the shown cells vary: low for an empty slot.
export function spreadOf({ pixels, mask }) {
  const mean = [0, 0, 0];
  let n = 0;
  mask.forEach((m, k) => {
    if (!m) return;
    for (let c = 0; c < 3; c++) mean[c] += pixels[k * 3 + c];
    n++;
  });
  if (!n) return 0;
  let spread = 0;
  mask.forEach((m, k) => {
    if (!m) return;
    for (let c = 0; c < 3; c++)
      spread += Math.abs(pixels[k * 3 + c] - mean[c] / n);
  });
  return spread / (n * 3);
}

// Whether the pill covers any of the cards: on most screens it sits below them.
export function coversCards(boxes, pill, height) {
  return boxes.some((box) => coveredFraction(box, pill, height) >= MIN_COVERED);
}

// thumbs: { keys, cols, width, data } with data RGBA, as cardThumbs.json's
// png decodes. Keys are gk-img's icon names: "<card id>" or "<card id>_<idol id>".
const indexes = new WeakMap();
function thumbIndex(thumbs) {
  if (!indexes.has(thumbs)) {
    const byCard = new Map();
    thumbs.keys.forEach((key, k) => {
      const id = parseInt(key, 10);
      if (!byCard.has(id)) byCard.set(id, new Map());
      byCard.get(id).set(key, k);
    });
    indexes.set(thumbs, byCard);
  }
  return indexes.get(thumbs);
}

// The icon the site shows for the card with this idol (gakumas-images'
// getImages), or all of them if the idol isn't known.
function iconsOf(variants, id, idolId) {
  if (idolId === undefined) return [...variants.values()];
  for (const key of [`${id}_${idolId}`, `${id}_6`, `${id}`]) {
    if (variants.has(key)) return [variants.get(key)];
  }
  return [...variants.values()];
}

function distance(sample, thumbs, k) {
  const S = THUMB_SIZE;
  const x0 = (k % thumbs.cols) * S;
  const y0 = Math.floor(k / thumbs.cols) * S;
  let d = 0;
  let n = 0;
  sample.mask.forEach((m, cell) => {
    if (!m) return;
    const o =
      ((y0 + Math.floor(cell / S)) * thumbs.width + x0 + (cell % S)) * 4;
    for (let c = 0; c < 3; c++)
      d += Math.abs(sample.pixels[cell * 3 + c] - thumbs.data[o + c]);
    n++;
  });
  return n ? d / (n * 3) : Infinity;
}

// The cards whose shown parts are closest, best first.
export function rankCovered(
  sample,
  thumbs,
  { idolId, allowed = () => true } = {},
) {
  const ranked = [];
  for (const [id, variants] of thumbIndex(thumbs)) {
    if (!allowed(id)) continue;
    const best = Math.min(
      ...iconsOf(variants, id, idolId).map((k) => distance(sample, thumbs, k)),
    );
    ranked.push({ id, distance: best });
  }
  return ranked.sort((a, b) => a.distance - b.distance);
}

function* combos(lists) {
  if (!lists.length) {
    yield [];
    return;
  }
  for (const head of lists[0])
    for (const rest of combos(lists.slice(1))) yield [head, ...rest];
}

// Rereads the cards the pill covers in skillCards (the classifier's reads, by
// box). powerOf(ids) is the total those ids would show; powerCandidates are
// the totals read off the screen. Returns the new reads.
export function readCoveredCards(
  imageData,
  boxes,
  skillCards,
  { pill, thumbs, pIdolId, powerOf, powerCandidates = [] },
) {
  const covered = boxes
    .map((box, slot) => ({ box, slot }))
    .filter(
      ({ box }) => coveredFraction(box, pill, imageData.height) >= MIN_COVERED,
    );
  if (!covered.length) return skillCards;
  const coveredSlots = new Set(covered.map(({ slot }) => slot));

  // A produce deals only its plan's cards and free ones (samePlanFilter).
  const plans = {};
  skillCards.forEach((id, slot) => {
    const plan = SkillCards.getById(id)?.plan;
    if (!coveredSlots.has(slot) && plan && plan != "free")
      plans[plan] = (plans[plan] || 0) + 1;
  });
  const [plan] = Object.entries(plans).sort((a, b) => b[1] - a[1])[0] || [];
  const allowed = (id) => {
    const own = SkillCards.getById(id)?.plan;
    return !plan || !own || own == "free" || own == plan;
  };
  const idolId = PIdols.getById(pIdolId)?.idolId;

  const options = covered.map(({ box }) => {
    const sample = sampleShown(imageData, box, pill);
    if (spreadOf(sample) < EMPTY_SPREAD) return [{ id: 0, distance: 0 }];
    const ranked = rankCovered(sample, thumbs, { idolId, allowed });
    const kept = ranked.filter(
      (c, i) => i < KEEP && c.distance <= ranked[0].distance + KEEP_WITHIN,
    );
    // A card and its + version can differ only where the pill covers.
    for (const { id } of [...kept]) {
      const other = getOtherVersionId(SkillCards, SkillCards.getById(id));
      if (other && !kept.some((c) => c.id == other)) {
        kept.push(
          ranked.find((c) => c.id == other) || {
            id: other,
            distance: Infinity,
          },
        );
      }
    }
    return kept;
  });

  let best = null;
  for (const picks of combos(options)) {
    const ids = [...skillCards];
    covered.forEach(({ slot }, i) => (ids[slot] = picks[i].id));
    const shown = powerCandidates.includes(powerOf(ids));
    const total = picks.reduce((sum, p) => sum + p.distance, 0);
    if (
      !best ||
      (shown && !best.shown) ||
      (shown == best.shown && total < best.total)
    ) {
      best = { ids, shown, total };
    }
  }
  return best.ids;
}
