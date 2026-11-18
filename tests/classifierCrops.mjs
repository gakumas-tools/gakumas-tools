/**
 * Real screenshot crops for the skill-card classifier, cut from the labelled
 * fixtures by the import harnesses themselves (same boxes the importer uses).
 *
 *   CLASSIFIER_CROPS_OUT=.classifier-data/skill_cards pnpm test:contest-loadout
 *   CLASSIFIER_CROPS_OUT=.classifier-data/skill_cards pnpm test:memory
 *
 * Only the training half of the screens is written (see isTrainingScreen), so
 * the other half stays unseen and scores a retrained model fairly. Each crop
 * goes to the class folder of its labelled card; a card with several art
 * variants ("<id>_<idol>") goes to the variant the shipped model ranks highest
 * among that card's variants.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, parse } from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { ICON_SIZE } from "../gakumas-tools/utils/imageProcessing/entityClassifier.js";

export const CROPS_OUT = process.env.CLASSIFIER_CROPS_OUT || null;

/** Half the screens, chosen by a hash of the file name so the split is stable. */
export function isTrainingScreen(file) {
  return createHash("sha1").update(parse(file).base).digest()[0] % 2 === 0;
}

function variantClass(logits, classes, id) {
  let best = null;
  classes.forEach((name, i) => {
    if (name.split("_")[0] !== String(id)) return;
    if (best === null || logits[i] > logits[best]) best = i;
  });
  return best === null ? null : classes[best];
}

/**
 * Writes one crop. `native` is the crop at screen resolution as raw RGB(A),
 * `small` the ICON_SIZE RGB buffer the importer classifies.
 */
export async function writeCrop({ session, classes }, file, slot, id, native, small) {
  const input = new ort.Tensor("float32", toPlanar(small), [1, 3, ICON_SIZE, ICON_SIZE]);
  const { classifier } = await session.run({ input }, ["classifier"]);
  const name = variantClass(classifier.data, classes, id);
  if (!name) return false;
  const dir = join(CROPS_OUT, name);
  mkdirSync(dir, { recursive: true });
  await sharp(native.data, { raw: native.raw })
    .removeAlpha()
    .png()
    .toFile(join(dir, `fx_${parse(file).name.replace(/[^\w-]/g, "_")}_${slot}.png`));
  return true;
}

function toPlanar(rgb) {
  const n = ICON_SIZE * ICON_SIZE;
  const out = new Float32Array(3 * n);
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) out[c * n + p] = rgb[p * 3 + c] / 255;
  return out;
}
