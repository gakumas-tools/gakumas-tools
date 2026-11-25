import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectLoadoutBoxes,
  visibleFraction,
} from "../../../../../gakumas-tools/utils/imageProcessing/contestLoadoutGeometry.js";
import { loadImage } from "../../../../badges.mjs";

async function boxes(file) {
  const image = await loadImage(
    new URL(`../../../../fixtures/contest_loadout/${file}`, import.meta.url)
      .pathname,
  );
  return { image, ...detectLoadoutBoxes(image) };
}

test("a sub row half under the edit panel's edge is left unread", async () => {
  const { mainBoxes, subBoxes } = await boxes("56.webp");
  assert.equal(mainBoxes.filter(Boolean).length, 6);
  assert.deepEqual(subBoxes, [null, null, null, null, null, null]);
});

test("a greyed-out 重複 card's dark label doesn't count as covered", async () => {
  const { image, subBoxes } = await boxes("17.webp");
  assert.ok(subBoxes[0]);
  assert.equal(visibleFraction(image, subBoxes[0]), 1);
});
