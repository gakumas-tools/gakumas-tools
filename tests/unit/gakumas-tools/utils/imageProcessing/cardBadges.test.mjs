import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEST_LAYOUT,
  readBadge,
  readBadges,
} from "../../../../../gakumas-tools/utils/imageProcessing/cardBadges.js";
import { detectLoadoutBoxes } from "../../../../../gakumas-tools/utils/imageProcessing/contestLoadoutGeometry.js";
import { loadImage } from "../../../../badges.mjs";

async function costs(file, cards) {
  const image = await loadImage(
    new URL(`../../../../fixtures/contest_loadout/${file}`, import.meta.url)
      .pathname,
  );
  const { mainBoxes, subBoxes } = detectLoadoutBoxes(image);
  const boxes = [...mainBoxes, ...subBoxes];
  return cards.map((i) => readBadges(image, boxes[i], CONTEST_LAYOUT).cost);
}

test("cost 10 reads both digits", async () => {
  assert.deepEqual(await costs("32.webp", [10]), [10]);
  assert.deepEqual(await costs("42.webp", [4]), [10]);
});

test("an antialiased cost digit still reads", async () => {
  assert.deepEqual(await costs("04.webp", [0]), [4]);
});

test("a number with an unrecognized digit is unread", () => {
  const templates = { 1: Array(140).fill(0), 2: Array(140).fill(0.1) };
  const one = { pixels: templates[1] };
  const two = { pixels: templates[2] };
  const unknown = { pixels: Array(140).fill(1) };
  assert.equal(readBadge([one, two], templates), 12);
  assert.equal(readBadge([one, unknown, two], templates), undefined);
  assert.equal(readBadge([unknown, one], templates, true), undefined);
});
