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
import DIGIT_TEMPLATES from "./contestLoadoutDigits.json";
import { classifyCrops, ICON_SIZE } from "./entityClassifier";
import { readNumber, segmentGlyphs } from "./glyphs";
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
  const imageData = getImageData(img);
  const { index: paramsLineIndex, params } = findParams(
    blackLines,
    imageData,
    img.width
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
export function extractParams(line, width) {
  if (PARAMS_REGEXP.test(line.text)) {
    return line.text.match(/\d+/g).map((t) => parseInt(t, 10));
  }
  return (paramWords(line, width) || []).map((word) => parseInt(word.text, 10));
}

// Find the Vo/Da/Vi/stamina line: a line of four numbers, then one with a
// number in each column, then, loosely, one with a digit in each column.
export function findParams(lines, imageData, width) {
  const passes = [
    (line) =>
      PARAMS_REGEXP.test(line.text) ? readParams(imageData, line, width) : [],
    (line) => readParams(imageData, line, width),
    (line) => readParams(imageData, line, width, true),
  ];
  for (const pass of passes) {
    for (let index = 0; index < lines.length; index++) {
      const params = pass(lines[index]);
      if (params.length === 4) return { index, params };
    }
  }
  return { index: -1, params: [] };
}

// The OCR words holding Vo, Da, Vi, stamina, or null if a column is missing.
// Loosely, any word with a digit counts, since in small screenshots OCR
// glues stray marks and the next column's rank badge onto a value. Such a
// word is cut short of that badge.
function paramWords(line, width, loose = false) {
  const numbers = (line.words || []).filter((word) =>
    (loose ? /\d/ : /^\d+$/).test(word.text.trim())
  );
  if (!loose && PARAMS_REGEXP.test(line.text) && numbers.length === 4) {
    return numbers;
  }
  if (!width) return null;

  // Rank icons sit left of the values in the first three columns.
  const words = Array(4).fill(null);
  for (const word of numbers) {
    const column = Math.floor((word.bbox.x0 / width) * 4);
    if (column < 3 && word.bbox.x1 < ((column + 0.6) * width) / 4) {
      continue;
    }
    words[column] = loose
      ? {
          ...word,
          bbox: {
            ...word.bbox,
            x1: Math.min(word.bbox.x1, ((column + 1.1) * width) / 4),
          },
        }
      : word;
  }
  return words.every((word) => word !== null) ? words : null;
}

const isParamInk = (r, g, b) =>
  Math.max(r, g, b) < 110 && Math.max(r, g, b) - Math.min(r, g, b) < 30;

// OCR misreads small numerals (Vo 65 as 85 in a 540 px wide screenshot), so
// each value is reread from its glyphs inside the OCR word's box. A rank
// badge merged into the word sits left of the value, so only the rightmost
// run of glyphs is read. Loose words have no OCR number to fall back on, so
// they read only if every value's glyphs do.
export function readParams(imageData, line, width, loose = false) {
  const words = paramWords(line, width, loose);
  if (!words) return loose ? [] : extractParams(line, width);
  const pad = Math.ceil((line.bbox.y1 - line.bbox.y0) * 0.15);
  const params = words.map((word) => {
    const value = readNumber(
      segmentGlyphs(
        imageData,
        {
          x0: Math.max(0, word.bbox.x0 - pad),
          x1: Math.min(imageData.width, word.bbox.x1 + pad),
          y0: Math.max(0, line.bbox.y0 - pad),
          y1: Math.min(imageData.height, line.bbox.y1 + pad),
        },
        isParamInk,
        true
      ),
      DIGIT_TEMPLATES.value
    );
    return Number.isInteger(value) || loose ? value : parseInt(word.text, 10);
  });
  return params.every(Number.isInteger) ? params : [];
}

export async function extractEntities(img, boxes, session, classes, allowed) {
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

  return classifyCrops(ort, session, classes, crops, 4, allowed);
}

function downloadCrop(canvas, i) {
  const link = document.createElement("a");
  link.setAttribute("href", canvas.toDataURL("image/webp"));
  link.setAttribute("download", `entity_${i}_${Date.now()}.webp`);
  document.body.append(link);
  link.click();
  document.body.removeChild(link);
}
