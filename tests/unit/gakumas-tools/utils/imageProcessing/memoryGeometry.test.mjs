import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  findNavPillTop,
  hiddenByNavPill,
} from "../../../../../gakumas-tools/utils/imageProcessing/memoryGeometry.js";

const FIXTURES = fileURLToPath(new URL("../../../../fixtures/memory/", import.meta.url));

async function load(name) {
  const { data, info } = await sharp(FIXTURES + name)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function plain(width, height, band) {
  const data = new Uint8ClampedArray(width * height * 4).fill(249);
  if (band) {
    for (let y = band[0]; y < band[1]; y++) {
      for (let x = 0; x < width; x++) {
        data.set([150, 146, 158, 255], (y * width + x) * 4);
      }
    }
  }
  return { data, width, height };
}

test("a grey band a tenth of the width tall near the bottom is the nav pill", () => {
  assert.equal(findNavPillTop(plain(200, 400, [350, 371])), 350);
});

test("a screen with no grey band has no nav pill", () => {
  assert.equal(findNavPillTop(plain(200, 400)), null);
});

test("a grey band much taller than the pill is not the pill", () => {
  assert.equal(findNavPillTop(plain(200, 400, [300, 371])), null);
});

// 03.png is a desktop window capture: the window is short, so the pill covers
// the second row of skill cards (boxes at y 1177–1321).
test("on a short window the pill hides the second row of skill cards", async () => {
  const pillTop = findNavPillTop(await load("03.png"));
  assert.equal(pillTop, 1204);
  assert.equal(hiddenByNavPill({ y: 1177, height: 144 }, pillTop), true);
  assert.equal(hiddenByNavPill({ y: 995, height: 143 }, pillTop), false);
});

// m10 is a phone capture: the pill sits well below the second row (boxes at
// y 1862–2078).
test("on a phone screen the pill hides no skill card", async () => {
  const pillTop = findNavPillTop(await load("account/m10.webp"));
  assert.equal(pillTop, 2264);
  assert.equal(hiddenByNavPill({ y: 1862, height: 216 }, pillTop), false);
});

test("with no pill nothing is hidden", () => {
  assert.equal(hiddenByNavPill({ y: 1177, height: 144 }, null), false);
});
