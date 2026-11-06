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

// Classes are "<entity id>" or "<entity id>_<idol id>" for art variants.
// allowed(id, i) can rule out entity ids for the i-th crop.
export function decodeEntityIds(logits, classes, allowed = () => true) {
  const numClasses = classes.length;
  const classIds = classes.map((c) => parseInt(c.split("_")[0], 10));
  const ids = [];
  for (let offset = 0; offset < logits.length; offset += numClasses) {
    const i = ids.length;
    let best = -1;
    for (let k = 0; k < numClasses; k++) {
      if (!allowed(classIds[k], i)) continue;
      if (best < 0 || logits[offset + k] > logits[offset + best]) best = k;
    }
    ids.push(best < 0 ? 0 : classIds[best]);
  }
  return ids;
}

// A contest loadout's first P-item slot is fixed to the main memory's P-idol's
// own item, so it's read among the items of the P-idols whose unique cards the
// main deck shows (a deck can hold another P-idol's unique card).
export function fixedPItemFilter(mainCardIds) {
  const pIdolIds = new Set(
    mainCardIds
      .map((id) => SkillCards.getById(id))
      .filter((card) => card?.sourceType == "pIdol")
      .map((card) => card.pIdolId),
  );
  return (id, slot) =>
    slot > 0 || !pIdolIds.size || pIdolIds.has(PItems.getById(id)?.pIdolId);
}

export async function classifyCrops(
  ort,
  session,
  classes,
  crops,
  channels,
  allowed,
) {
  if (!crops.length) return [];
  const input = new ort.Tensor("float32", packCrops(crops, channels), [
    crops.length,
    3,
    ICON_SIZE,
    ICON_SIZE,
  ]);
  const output = await session.run({ input }, ["classifier"]);
  return decodeEntityIds(output.classifier.data, classes, allowed);
}
