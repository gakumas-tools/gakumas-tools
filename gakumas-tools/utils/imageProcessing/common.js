export const DEBUG = false;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const blobURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = blobURL;
    img.onload = () => {
      URL.revokeObjectURL(blobURL);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(blobURL);
      reject(err);
    };
  });
}

// Get a canvas with image black/white filtered, optionally upscaled
function getPreprocessedCanvas(img, textColorFn, scale = 1) {
  const width = img.width * scale;
  const height = img.height * scale;
  let canvas;
  if (DEBUG) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  } else {
    canvas = new OffscreenCanvas(width, height);
  }
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  let d = ctx.getImageData(0, 0, width, height);
  for (var i = 0; i < d.data.length; i += 4) {
    if (textColorFn(d.data[i], d.data[i + 1], d.data[i + 2])) {
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
    } else {
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);

  return canvas;
}

// Black or entity edge color
export function getBlackCanvas(img) {
  const canvas = getPreprocessedCanvas(img, (r, g, b) => {
    const average = (r + g + b) / 3;
    return (
      (r < 185 &&
        g < 185 &&
        b < 185 &&
        Math.abs(r - average) < 8 &&
        Math.abs(g - average) < 8 &&
        Math.abs(b - average) < 8) ||
      (r > 70 && r < 120 && g > 70 && g < 120 && b > 90 && b < 130)
    );
  });

  // Desktop window captures include dark frame edges that binarize to black
  // and get OCR'd as stray glyphs glued onto real lines (e.g. "|" prefixing
  // the params line), breaking both matching and bbox-anchored geometry.
  // Wipe a thin margin so frame pixels never reach OCR.
  const ctx = canvas.getContext("2d");
  const margin = Math.ceil(canvas.width * 0.012);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, margin);
  ctx.fillRect(0, canvas.height - margin, canvas.width, margin);
  ctx.fillRect(0, 0, margin, canvas.height);
  ctx.fillRect(canvas.width - margin, 0, margin, canvas.height);

  return canvas;
}

// White (contest power text)
export function getWhiteCanvas(img, threshold = 252, scale = 1) {
  return getPreprocessedCanvas(
    img,
    (r, g, b) => r > threshold && g > threshold && b > threshold,
    scale,
  );
}

// Get lines from result
export function extractLines(result) {
  return result.data.blocks
    .map((block) => block.paragraphs.map((paragraph) => paragraph.lines))
    .flat(2);
}

// ---- Pixel analysis helpers (shared across pixel-based detectors) ----

const WHITE_THRESHOLD = 240;

export function getImageData(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  canvas.width = canvas.height = 0;
  return imageData;
}

export function isWhite(data, i) {
  return (
    data[i] > WHITE_THRESHOLD &&
    data[i + 1] > WHITE_THRESHOLD &&
    data[i + 2] > WHITE_THRESHOLD
  );
}

export function saturation(data, i) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function groupContiguous(indices, gapTolerance) {
  if (!indices.length) return [];
  const groups = [];
  let start = indices[0];
  let prev = start;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] - prev > gapTolerance) {
      groups.push([start, prev]);
      start = indices[i];
    }
    prev = indices[i];
  }
  groups.push([start, prev]);
  return groups;
}

export function largestGroup(groups) {
  return groups.reduce((best, cur) =>
    cur[1] - cur[0] > best[1] - best[0] ? cur : best,
  );
}

// Find the tallest rectangular region of "mostly white" pixels. Used to locate
// the modal/panel background that each in-game screenshot places on top of the
// gray app chrome.
export function detectWhitePanel(
  { data, width, height },
  { rowWhiteFrac, colWhiteFrac, rowGapTolerance },
) {
  const rowThreshold = width * rowWhiteFrac;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (isWhite(data, rowStart + x * 4)) count++;
    }
    if (count > rowThreshold) rows.push(y);
  }
  if (!rows.length) return null;

  const [yTop, yBottom] = largestGroup(groupContiguous(rows, rowGapTolerance));
  const panelHeight = yBottom - yTop + 1;
  const colThreshold = panelHeight * colWhiteFrac;

  let xLeft = -1;
  let xRight = -1;
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = yTop; y <= yBottom; y++) {
      if (isWhite(data, (y * width + x) * 4)) count++;
    }
    if (count > colThreshold) {
      if (xLeft === -1) xLeft = x;
      xRight = x;
    }
  }
  if (xLeft === -1) return null;

  return {
    x: xLeft,
    y: yTop,
    width: xRight - xLeft + 1,
    height: panelHeight,
  };
}
