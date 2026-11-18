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

// The game's nav pill (home, help, back) floats over the bottom of the screen.
// On a short screen it covers the second row of skill cards, so what shows of
// those cards is a sliver and their cost badges, not enough to tell the card.
// The pill is a band of plain grey about a tenth of the screen's width tall
// across its left half. Returns the band's top row, or null if there is none.
export function findNavPillTop({ data, width, height }) {
  const channels = Math.round(data.length / (width * height));
  const x0 = Math.round(width * 0.06);
  const x1 = Math.round(width * 0.45);
  const minRun = width * 0.07;
  const maxRun = width * 0.15;
  const from = Math.max(0, Math.round(height - width * 0.35));
  const isPillRow = (y) => {
    let grey = 0;
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * channels;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const mean = (r + g + b) / 3;
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 35 && mean >= 100 && mean <= 200) grey++;
    }
    return grey >= (x1 - x0) * 0.6;
  };
  let runEnd = -1;
  for (let y = height - 1; y >= from; y--) {
    if (isPillRow(y)) {
      if (runEnd < 0) runEnd = y;
    } else if (runEnd >= 0) {
      const length = runEnd - y;
      if (length >= minRun && length <= maxRun) return y + 1;
      runEnd = -1;
    }
  }
  return null;
}

// A card more than half under the pill can't be read; leave its slot empty
// for the player to fill rather than guess.
export function hiddenByNavPill(box, pillTop) {
  return pillTop != null && box.y + box.height / 2 > pillTop;
}
