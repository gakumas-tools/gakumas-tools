import { PItems, SkillCards } from "gakumas-data";
import * as ort from "onnxruntime-web/wasm";
import { MEMORY_LAYOUT, readCustomizations } from "./cardBadges";
import {
  DEBUG,
  getBlackCanvas,
  getImageData,
  getWhiteCanvas,
  loadImageFromFile,
  extractLines,
} from "./common";
import { classifyCrops, ICON_SIZE } from "./entityClassifier";
import {
  getPItemBoundingBoxes,
  getSkillCardBoundingBoxes,
} from "./memoryGeometry";
import { calculateContestPower } from "../contestPower";

// No `g` flag: a global regex keeps lastIndex between .test() calls, which
// makes matching stateful across lines/files and intermittently fail.
const PARAMS_REGEXP = /^\s*\d+\s+\d+\s+\d+\s+\d+\s*$/;

export async function getMemoryFromFile(
  file,
  engWorker,
  pItemSession,
  pItemClasses,
  skillCardSession,
  skillCardClasses
) {
  const img = await loadImageFromFile(file);
  const blackCanvas = getBlackCanvas(img);
  const whiteCanvas = getWhiteCanvas(img);
  let engWhiteResult, engBlackResult;
  try {
    engWhiteResult = await engWorker.recognize(whiteCanvas);
    engBlackResult = await engWorker.recognize(
      blackCanvas,
      {},
      { blocks: true }
    );
  } finally {
    blackCanvas.width = blackCanvas.height = 0;
    whiteCanvas.width = whiteCanvas.height = 0;
  }

  const powerCandidates = extractPower(engWhiteResult);
  const blackLines = extractLines(engBlackResult);
  const paramsLineIndex = blackLines.findIndex(({ text }) =>
    PARAMS_REGEXP.test(text)
  );
  const paramsLine = blackLines[paramsLineIndex];
  const pItemsLabelLine = blackLines[paramsLineIndex + 1];
  if (!paramsLine || !pItemsLabelLine) {
    throw new Error(
      "Could not locate the Vo/Da/Vi/stamina parameter line. Is this a memory screenshot?",
    );
  }

  const contentWidth = paramsLine.bbox.x1 - pItemsLabelLine.bbox.x0;
  const anchorPoint = {
    x: pItemsLabelLine.bbox.x0,
    y: pItemsLabelLine.bbox.y1,
  };

  const pItemBoxes = getPItemBoundingBoxes(anchorPoint, contentWidth);
  const skillCardBoxes = getSkillCardBoundingBoxes(anchorPoint, contentWidth);

  // Draw boxes for debugging
  if (DEBUG) {
    debugBoundingBoxes(img, [
      {
        x: paramsLine.bbox.x0,
        y: paramsLine.bbox.y0,
        width: paramsLine.bbox.x1 - paramsLine.bbox.x0,
        height: paramsLine.bbox.y1 - paramsLine.bbox.y0,
      },
      ...pItemBoxes,
      ...skillCardBoxes,
    ]);
  }

  const params = extractParams(paramsLine);
  const pItems = await extractEntities(
    img,
    pItemBoxes,
    pItemSession,
    pItemClasses
  );
  const skillCards = await extractEntities(
    img,
    skillCardBoxes,
    skillCardSession,
    skillCardClasses
  );

  const imageData = getImageData(img);
  const customizations = skillCards.map((id, i) =>
    readCustomizations(imageData, skillCardBoxes[i], MEMORY_LAYOUT, id)
  );

  console.log(
    "Extracted p-items:",
    pItems.map((id) => PItems.getById(id)?.name || id)
  );
  console.log(
    "Extracted skill cards:",
    skillCards.map((id) => SkillCards.getById(id)?.name || id)
  );

  const itemsPIdolId = pItems
    .filter((c) => !!c)
    .map(PItems.getById)
    .find((item) => item.pIdolId)?.pIdolId;

  const cardsPIdolId = skillCards
    .filter((c) => !!c)
    .map(SkillCards.getById)
    .find((card) => card.pIdolId)?.pIdolId;

  // Calculate contest power and flag those that are mismatched with the screenshot
  const calculatedPower = calculateContestPower(
    params,
    pItems,
    skillCards,
    customizations
  );
  const flag =
    !powerCandidates.includes(calculatedPower) || itemsPIdolId != cardsPIdolId;

  return {
    name: `${Math.max(...powerCandidates, 0)}${flag ? " (FIXME)" : ""}`,
    pIdolId: cardsPIdolId,
    params,
    pItemIds: pItems,
    skillCardIds: skillCards,
    customizations,
  };
}

function debugBoundingBoxes(img, boxes) {
  const debugCanvas = document.createElement("canvas");
  debugCanvas.width = img.width;
  debugCanvas.height = img.height;
  const debugCtx = debugCanvas.getContext("2d");
  debugCtx.drawImage(img, 0, 0);
  debugCtx.strokeStyle = "red";
  debugCtx.lineWidth = 2;
  boxes.forEach((box) => {
    debugCtx.strokeRect(box.x, box.y, box.width, box.height);
  });
  document.body.append(debugCanvas);
}

// Read contest power from OCR result
const POWER_REGEXP = new RegExp(/\d+/gm);
export function extractPower(result) {
  const powerLines = result.data.text.match(POWER_REGEXP) || [];
  const powerCandidates = powerLines.map((p) => parseInt(p, 10));
  return powerCandidates;
}

// Read Vo, Da, Vi, stamina from line
export function extractParams(line) {
  return (line.text.match(/\d+/g) || []).map((t) => parseInt(t, 10));
}

export async function extractEntities(img, boxes, session, classes) {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const crops = boxes.map((box, i) => {
    ctx.drawImage(
      img,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      ICON_SIZE,
      ICON_SIZE
    );
    if (DEBUG) {
      document.body.append(canvas);
      downloadCrop(canvas, i);
    }
    return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data;
  });

  return classifyCrops(ort, session, classes, crops, 4);
}

function downloadCrop(canvas, i) {
  const link = document.createElement("a");
  link.setAttribute("href", canvas.toDataURL("image/webp"));
  link.setAttribute("download", `entity_${i}_${Date.now()}.webp`);
  document.body.append(link);
  link.click();
  document.body.removeChild(link);
}
