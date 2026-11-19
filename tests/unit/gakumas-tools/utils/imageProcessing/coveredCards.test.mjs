import { test } from "node:test";
import assert from "node:assert/strict";
import { findNavPill } from "../../../../../gakumas-tools/utils/imageProcessing/memoryGeometry.js";
import {
  coveredFraction,
  coversCards,
  sampleShown,
  spreadOf,
  THUMB_SIZE,
} from "../../../../../gakumas-tools/utils/imageProcessing/coveredCards.js";
import { fileURLToPath } from "node:url";
import { loadImage } from "../../../../badges.mjs";

const fixture = (name) =>
  loadImage(
    fileURLToPath(
      new URL(`../../../../fixtures/memory/${name}`, import.meta.url),
    ),
  );

test("findNavPill finds the pill over the second card row", async () => {
  const pill = findNavPill(await fixture("pill/p01.webp"));
  assert.ok(pill);
  assert.ok(Math.abs(pill.top - 1820) <= 4, `top ${pill.top}`);
  assert.ok(Math.abs(pill.bottom - 1935) <= 4, `bottom ${pill.bottom}`);
  assert.ok(pill.left < 60 && pill.right > 480, `${pill.left}..${pill.right}`);
});

test("findNavPill finds it on a screen of another size", async () => {
  const pill = findNavPill(await fixture("03.png"));
  assert.ok(pill);
  assert.ok(Math.abs(pill.top - 1204) <= 4, `top ${pill.top}`);
});

test("findNavPill finds the pill below the cards on a taller screen", async () => {
  for (const name of ["pill/n01.webp", "account/m01.webp"]) {
    const pill = findNavPill(await fixture(name));
    assert.ok(pill && Math.abs(pill.top - 2264) <= 4, name);
  }
});

test("findNavPill finds nothing on a screen without one", async () => {
  const { width, height } = await fixture("pill/p01.webp");
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  assert.equal(findNavPill({ data, width, height }), null);
});

test("coveredFraction counts what's under the pill and past the bottom edge", () => {
  const pill = { top: 100, bottom: 150, left: 0, right: 500 };
  const box = { x: 10, y: 80, width: 100, height: 100 };
  assert.equal(coveredFraction(box, pill, 1000), 0.5);
  assert.equal(coveredFraction(box, pill, 160), 0.7);
  assert.equal(coveredFraction({ ...box, x: 600 }, pill, 1000), 0);
  assert.equal(coversCards([box], pill, 1000), true);
  assert.equal(coversCards([{ ...box, y: 300 }], pill, 1000), false);
});

test("an empty slot hardly varies, where a card does", () => {
  const width = 120;
  const height = 120;
  const flat = new Uint8ClampedArray(width * height * 4).fill(240);
  // Alternating columns of cells, as a card's art varies.
  const varied = flat.map(
    (v, i) => (Math.floor(((i >> 2) % width) / 10) % 2) * 200,
  );
  const box = { x: 0, y: 0, width: 120, height: 120 };
  const pill = { top: 60, bottom: 120, left: 0, right: 120 };
  const empty = sampleShown({ data: flat, width, height }, box, pill);
  const card = sampleShown({ data: varied, width, height }, box, pill);
  assert.ok(empty.mask.some(Boolean) && !empty.mask.every(Boolean));
  assert.equal(empty.pixels.length, THUMB_SIZE * THUMB_SIZE * 3);
  assert.ok(spreadOf(empty) < 1);
  assert.ok(spreadOf(card) > 8);
});
