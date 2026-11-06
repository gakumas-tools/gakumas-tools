import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  extractParams,
  readParams,
} from "../../../../../gakumas-tools/utils/imageProcessing/memory.js";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../../fixtures/ingame/memory-params-ocr.json", import.meta.url),
    "utf8",
  ),
);

test("a row containing four numbers reads as those parameters", () => {
  assert.deepEqual(extractParams({ text: "936 2518 1862 44\n" }), [
    936, 2518, 1862, 44,
  ]);
});

test("rank badges read as numbers are excluded from the captured parameters", () => {
  assert.deepEqual(
    extractParams(fixture.line, fixture.width),
    fixture.params,
  );
});

test("the captured row reads the same after resizing the screenshot", () => {
  const line = {
    text: fixture.line.text,
    words: fixture.line.words.map((word) => ({
      ...word,
      bbox: {
        x0: word.bbox.x0 / 2,
        y0: word.bbox.y0 / 2,
        x1: word.bbox.x1 / 2,
        y1: word.bbox.y1 / 2,
      },
    })),
  };
  assert.deepEqual(extractParams(line, fixture.width / 2), fixture.params);
});

test("a noisy row missing a parameter column is rejected", () => {
  const line = {
    text: fixture.line.text.replace(" 32", ""),
    words: fixture.line.words.slice(0, -1),
  };
  assert.deepEqual(extractParams(line, fixture.width), []);
});

test("a rank digit does not fill a missing dance parameter", () => {
  const line = {
    text: fixture.line.text.replace(" 86", ""),
    words: fixture.line.words.filter((word) => word.text !== "86"),
  };
  assert.deepEqual(extractParams(line, fixture.width), []);
});

test("small numerals that OCR misreads are reread from their glyphs", async () => {
  const small = JSON.parse(
    readFileSync(
      new URL("../../../../fixtures/ingame/memory-params-540.json", import.meta.url),
      "utf8",
    ),
  );
  const { data, info } = await sharp(
    new URL("../../../../fixtures/ingame/memory-params-540.png", import.meta.url)
      .pathname,
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const imageData = { data, width: info.width, height: info.height };
  assert.notDeepEqual(extractParams(small.line, small.width), small.params);
  assert.deepEqual(readParams(imageData, small.line, small.width), small.params);
});
