import { PItems, SkillCards } from "gakumas-data";
import { IdolConfig } from "gakumas-engine";
import * as ort from "onnxruntime-web/wasm";
import { findStageCandidates } from "@/utils/supportBonus";
import { readLoadoutCards } from "./cardBadges";
import { DEBUG, getImageData, loadImageFromFile } from "./common";
import { detectLoadoutBoxes } from "./contestLoadoutGeometry";
import { readStats } from "./contestLoadoutStats";
import {
  classifyCrops,
  firstPItemFilter,
  ICON_SIZE,
  samePlanFilter,
  slotFilters,
} from "./entityClassifier";
import {
  findIdolRoadLoadout,
  idolRoadLoadout,
} from "./idolRoadImport";
import {
  idolRoadCardFilter,
  liftGreyedOut,
  readIdolRoadCards,
} from "./idolRoadLoadout";
import { extractEntities } from "./memory";
import { loadPItemModel, loadSkillCardModel } from "./models";

// One or two screenshots: the Idol Road 「スコア獲得編成確認」 screen (its top,
// and optionally one scrolled to the bottom of the deck, in either order),
// else a contest loadout, read from the first.
export async function getSimulatorLoadoutFromFiles(files, currentStageId) {
  const imgs = await Promise.all([...files].map(loadImageFromFile));
  // Kick off model loads in parallel with pixel work — cold start dominates
  // first-use latency and the two are independent.
  const modelsPromise = Promise.all([loadPItemModel(), loadSkillCardModel()]);
  const imageDatas = imgs.map(getImageData);
  const idolRoad = findIdolRoadLoadout(imageDatas);
  if (idolRoad) {
    const { order, found } = idolRoad;
    return readIdolRoadLoadout(
      order.map((i) => imgs[i]),
      order.map((i) => imageDatas[i]),
      found,
      modelsPromise,
    );
  }
  return readContestLoadout(imgs[0], imageDatas[0], currentStageId, modelsPromise);
}

// One screenshot, as before.
export function getSimulatorLoadoutFromFile(file, currentStageId) {
  return getSimulatorLoadoutFromFiles([file], currentStageId);
}

async function readIdolRoadLoadout(imgs, imageDatas, found, modelsPromise) {
  const [
    { session: pItemSession, classes: pItemClasses },
    { session: skillCardSession, classes: skillCardClasses },
  ] = await modelsPromise;

  // Sequential, as below: the WASM runtime runs one session at a time.
  const present = found.slots.flat().filter(Boolean);
  const cardIds = await classifyCrops(
    ort,
    skillCardSession,
    skillCardClasses,
    present.map((slot) => {
      const pixels = cropPixels(imgs[slot.image], slot.box);
      return slot.greyed ? liftGreyedOut(pixels) : pixels;
    }),
    4,
    undefined,
    idolRoadCardFilter(found.slots).refine,
  );
  const cards = readIdolRoadCards(imageDatas, found.slots, cardIds);
  const chosenBoxes = found.pItemBoxes.slice(1);
  const reads = await classifyCrops(
    ort,
    pItemSession,
    pItemClasses,
    chosenBoxes.filter(Boolean).map((box) => cropPixels(imgs[0], box)),
    4,
  );
  const chosenPItemIds = chosenBoxes.map((box) => (box ? reads.shift() : 0));

  const loadout = idolRoadLoadout(found, cards, chosenPItemIds);
  if (DEBUG) {
    console.log("Idol Road stage:", found.stage, loadout.stageCandidates);
    console.log("Extracted Idol Road loadout:", loadout);
  }
  return loadout;
}

// The ICON_SIZE square RGBA pixels of one box.
function cropPixels(img, box) {
  const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    img,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    ICON_SIZE,
    ICON_SIZE,
  );
  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data;
}

async function readContestLoadout(img, imageData, currentStageId, modelsPromise) {
  const { mainRow, pItemBoxes, mainBoxes, subBoxes } =
    detectLoadoutBoxes(imageData);
  const { params, percents } = readStats(imageData, mainRow);

  if (DEBUG) {
    debugOverlay(img, [...pItemBoxes, ...mainBoxes, ...subBoxes]);
  }

  const [
    { session: pItemSession, classes: pItemClasses },
    { session: skillCardSession, classes: skillCardClasses },
  ] = await modelsPromise;

  // onnxruntime-web's WASM runtime is shared across sessions — concurrent
  // session.run calls throw "Session already started", so these must run
  // sequentially. Batching by session avoids the per-call setup overhead.
  const skillCardIds = await classifySlots(
    img,
    [...mainBoxes, ...subBoxes],
    skillCardSession,
    skillCardClasses,
    undefined,
    samePlanFilter([...mainBoxes.map(() => 0), ...subBoxes.map(() => 1)]),
  );
  const pItemIds = await classifySlots(
    img,
    pItemBoxes,
    pItemSession,
    pItemClasses,
    firstPItemFilter(skillCardIds.slice(0, mainBoxes.length)),
  );
  const { skillCardIdGroups, customizationGroups } = readLoadoutCards(
    imageData,
    [mainBoxes, subBoxes],
    [
      skillCardIds.slice(0, mainBoxes.length),
      skillCardIds.slice(mainBoxes.length),
    ],
  );
  const [mainIds, subIds] = skillCardIdGroups;

  const { plan } = new IdolConfig({
    params,
    pItemIds,
    skillCardIdGroups,
  });
  const stageCandidates = findStageCandidates(params, percents, {
    currentStageId,
    plan,
  });

  if (DEBUG) {
    console.log("Extracted stats:", params, percents, stageCandidates);
    console.log(
      "Extracted p-items:",
      pItemIds.map((id) => PItems.getById(id)?.name || id),
    );
    console.log(
      "Extracted main skill cards:",
      mainIds.map((id) => SkillCards.getById(id)?.name || id),
    );
    console.log(
      "Extracted sub skill cards:",
      subIds.map((id) => SkillCards.getById(id)?.name || id),
    );
  }

  return {
    ...stageCandidates[0],
    stageCandidates,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  };
}

// Slots cut off by the screenshot's edge come back null and stay empty.
async function classifySlots(img, boxes, session, classes, allowed, refine) {
  const slots = boxes.flatMap((box, i) => (box ? [i] : []));
  const filters = slotFilters(slots, boxes.length, allowed, refine);
  const ids = await extractEntities(
    img,
    slots.map((i) => boxes[i]),
    session,
    classes,
    filters.allowed,
    filters.refine,
  );
  return boxes.map((box) => (box ? ids.shift() : 0));
}

function debugOverlay(img, boxes) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "red";
  for (const box of boxes.filter(Boolean)) {
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  document.body.append(canvas);
}
