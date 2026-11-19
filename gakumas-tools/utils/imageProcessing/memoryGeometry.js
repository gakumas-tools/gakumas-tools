// Per-card box positions for the memory screen, anchored to the OCR-located
// "Pアイテム" label line. Pure geometry — no DOM or OCR dependencies — so
// this is shared between the browser entry point (`memory.js`) and the Node
// regression harness.

export function getPItemBoundingBoxes(anchorPoint, contentWidth) {
  const pItemsTL = {
    x: anchorPoint.x - contentWidth * 0.006,
    y: anchorPoint.y + contentWidth * 0.03,
  };
  const pItemsWidth = contentWidth * 0.147;
  const pItemsGap = contentWidth * 0.023;
  const pItemBoxes = [];
  for (let i = 0; i < 4; i++) {
    pItemBoxes.push({
      x: pItemsTL.x + i * (pItemsWidth + pItemsGap),
      y: pItemsTL.y,
      width: pItemsWidth,
      height: pItemsWidth,
    });
  }
  return pItemBoxes;
}

export function getSkillCardBoundingBoxes(anchorPoint, contentWidth) {
  const skillCardsTL = {
    x: anchorPoint.x - contentWidth * 0.003,
    y: anchorPoint.y + contentWidth * 0.302,
  };
  const skillCardsWidth = contentWidth * 0.248;
  const skillCardsHGap = contentWidth * 0.023;
  const skillCardsVGap = contentWidth * 0.067;
  const skillCardBoxes = [];
  for (let i = 0; i < 6; i++) {
    skillCardBoxes.push({
      x: skillCardsTL.x + (i % 4) * (skillCardsWidth + skillCardsHGap),
      y:
        skillCardsTL.y + Math.floor(i / 4) * (skillCardsWidth + skillCardsVGap),
      width: skillCardsWidth,
      height: skillCardsWidth,
    });
  }
  return skillCardBoxes;
}

// The game's nav pill (home, help, back) floats over the bottom of the
// screen. On a short screen it covers the second row of skill cards: a
// frosted-glass band of plain grey, about a tenth of the screen's width tall,
// across the left half. Returns its rectangle, or null if there is none.
export function findNavPill({ data, width, height }) {
  const channels = Math.round(data.length / (width * height));
  const isGrey = (x, y) => {
    const o = (y * width + x) * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const mean = (r + g + b) / 3;
    return (
      Math.max(r, g, b) - Math.min(r, g, b) <= 35 && mean >= 100 && mean <= 200
    );
  };
  const x0 = Math.round(width * 0.06);
  const x1 = Math.round(width * 0.45);
  const isPillRow = (y) => {
    let grey = 0;
    for (let x = x0; x < x1; x++) if (isGrey(x, y)) grey++;
    return grey >= (x1 - x0) * 0.6;
  };
  let runEnd = -1;
  for (
    let y = height - 1;
    y >= Math.max(0, Math.round(height - width * 0.35));
    y--
  ) {
    if (isPillRow(y)) {
      if (runEnd < 0) runEnd = y;
      continue;
    }
    if (runEnd >= 0) {
      const top = y + 1;
      const bottom = runEnd + 1;
      if (bottom - top >= width * 0.07 && bottom - top <= width * 0.15) {
        const mid = Math.round((top + bottom) / 2);
        let left = x0;
        while (left > 0 && isGrey(left - 1, mid)) left--;
        let right = x1;
        while (right < width && isGrey(right, mid)) right++;
        return { top, bottom, left, right };
      }
      runEnd = -1;
    }
  }
  return null;
}
