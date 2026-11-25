import { PItems, SkillCards } from "gakumas-data";

export const ICON_SIZE = 64;
const PIXELS = ICON_SIZE * ICON_SIZE;

export function packCrops(crops, channels) {
  const batch = new Float32Array(crops.length * 3 * PIXELS);
  crops.forEach((pixels, i) => {
    const offset = i * 3 * PIXELS;
    for (let j = 0; j < PIXELS; j++) {
      batch[offset + j] = pixels[j * channels] / 255;
      batch[offset + PIXELS + j] = pixels[j * channels + 1] / 255;
      batch[offset + 2 * PIXELS + j] = pixels[j * channels + 2] / 255;
    }
  });
  return batch;
}

// The skill card model's class for a card the game's nav pill covers: what
// shows of it doesn't name the card. Readers that can leave a slot for the
// player opt in with keepCovered; for the others it is never a read.
export const COVERED_ENTITY_ID = -1;

// Classes are "<entity id>" or "<entity id>_<idol id>" for art variants.
// allowed(id, i) can rule out entity ids for the i-th crop.
export function decodeEntityIds(
  logits,
  classes,
  allowed = () => true,
  keepCovered = false,
) {
  const numClasses = classes.length;
  const classIds = classes.map((c) => parseInt(c.split("_")[0], 10));
  const ids = [];
  for (let offset = 0; offset < logits.length; offset += numClasses) {
    const i = ids.length;
    let best = -1;
    for (let k = 0; k < numClasses; k++) {
      if (!keepCovered && classIds[k] == COVERED_ENTITY_ID) continue;
      if (!allowed(classIds[k], i)) continue;
      if (best < 0 || logits[offset + k] > logits[offset + best]) best = k;
    }
    ids.push(best < 0 ? 0 : classIds[best]);
  }
  return ids;
}

// A memory's first P-item is always its P-idol's own item, so a contest
// loadout's first P-item slot is read among the items of the P-idols whose
// unique cards the main deck shows (a deck can hold another P-idol's unique
// card).
export function firstPItemFilter(mainCardIds) {
  const pIdolIds = new Set(
    mainCardIds
      .map((id) => SkillCards.getById(id))
      .filter((card) => card?.sourceType == "pIdol")
      .map((card) => card.pIdolId),
  );
  return (id, slot) =>
    slot > 0 || !pIdolIds.size || pIdolIds.has(PItems.getById(id)?.pIdolId);
}

// A produce deals only cards of its P-idol's plan and free cards, so every
// card of one memory shares a plan. rows[slot] says which memory a slot is
// from. Given the first reads by slot, each memory's plan is the one most of
// its non-free reads agree on (none on a tie), and the second read keeps to
// it.
export function samePlanFilter(rows) {
  const planOf = (id) => SkillCards.getById(id)?.plan;
  return (ids) => {
    const votes = new Map();
    ids.forEach((id, slot) => {
      const plan = planOf(id);
      if (!plan || plan == "free") return;
      const row = votes.get(rows[slot]) || {};
      row[plan] = (row[plan] || 0) + 1;
      votes.set(rows[slot], row);
    });
    const plans = new Map();
    for (const [row, counts] of votes) {
      const [first, second] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!second || first[1] > second[1]) plans.set(row, first[0]);
    }
    return (id, slot) => {
      const plan = plans.get(rows[slot]);
      const own = planOf(id);
      return !plan || !own || own == "free" || own == plan;
    };
  };
}

// Only slots with a box are cropped; this maps slot-indexed filters onto the
// order of the crops.
export function slotFilters(slots, numSlots, allowed, refine) {
  return {
    allowed: allowed && ((id, i) => allowed(id, slots[i])),
    refine:
      refine &&
      ((ids) => {
        const bySlot = new Array(numSlots).fill(0);
        slots.forEach((slot, i) => (bySlot[slot] = ids[i]));
        const second = refine(bySlot);
        return (id, i) => second(id, slots[i]);
      }),
  };
}

// refine(ids), if given, returns a second allowed() from the first reads;
// the crops are then read again from the same logits.
export async function classifyCrops(
  ort,
  session,
  classes,
  crops,
  channels,
  allowed,
  refine,
  keepCovered = false,
) {
  if (!crops.length) return [];
  const input = new ort.Tensor("float32", packCrops(crops, channels), [
    crops.length,
    3,
    ICON_SIZE,
    ICON_SIZE,
  ]);
  const output = await session.run({ input }, ["classifier"]);
  const logits = output.classifier.data;
  const ids = decodeEntityIds(logits, classes, allowed, keepCovered);
  if (!refine) return ids;
  const second = refine(ids);
  return decodeEntityIds(
    logits,
    classes,
    (id, i) => (!allowed || allowed(id, i)) && second(id, i),
    keepCovered,
  );
}
