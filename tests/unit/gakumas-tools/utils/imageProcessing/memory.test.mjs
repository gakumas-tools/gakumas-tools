import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  extractParams,
  findParams,
  readParams,
} from "../../../../../gakumas-tools/utils/imageProcessing/memory.js";
import { hasIngameFixtures, loadIngameFixture } from "../../../../ingameFixtures.mjs";

const fixture = hasIngameFixtures && loadIngameFixture("memory-params-ocr");
const needsFixture = { skip: !hasIngameFixtures };

test("a row containing four numbers reads as those parameters", () => {
  assert.deepEqual(extractParams({ text: "936 2518 1862 44\n" }), [
    936, 2518, 1862, 44,
  ]);
});

test("rank badges read as numbers are excluded from the captured parameters", needsFixture, () => {
  assert.deepEqual(
    extractParams(fixture.line, fixture.width),
    fixture.params,
  );
});

test("the captured row reads the same after resizing the screenshot", needsFixture, () => {
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

test("a noisy row missing a parameter column is rejected", needsFixture, () => {
  const line = {
    text: fixture.line.text.replace(" 32", ""),
    words: fixture.line.words.slice(0, -1),
  };
  assert.deepEqual(extractParams(line, fixture.width), []);
});

test("a rank digit does not fill a missing dance parameter", needsFixture, () => {
  const line = {
    text: fixture.line.text.replace(" 86", ""),
    words: fixture.line.words.filter((word) => word.text !== "86"),
  };
  assert.deepEqual(extractParams(line, fixture.width), []);
});

async function loadCrop(name) {
  const crop = loadIngameFixture(name);
  const { data, info } = await sharp(
    new URL(`../../../../fixtures/ingame/${name}.png`, import.meta.url).pathname,
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { ...crop, imageData: { data, width: info.width, height: info.height } };
}

test("small numerals that OCR misreads are reread from their glyphs", needsFixture, async () => {
  const small = await loadCrop("memory-params-540");
  assert.notDeepEqual(extractParams(small.line, small.width), small.params);
  assert.deepEqual(
    readParams(small.imageData, small.line, small.width),
    small.params,
  );
});

for (const name of ["memory-params-480", "memory-params-900"]) {
  test(`values OCR glued stray marks onto are found and read (${name})`, needsFixture, async () => {
    const small = await loadCrop(name);
    assert.deepEqual(extractParams(small.line, small.width), []);
    assert.deepEqual(findParams([small.line], small.imageData, small.width), {
      index: 0,
      params: small.params,
    });
  });
}

test("a line missing a digit in a column is not found loosely", needsFixture, async () => {
  const small = await loadCrop("memory-params-900");
  const line = {
    ...small.line,
    words: small.line.words.filter((word) => !word.text.includes("¢")),
  };
  assert.deepEqual(findParams([line], small.imageData, small.width), {
    index: -1,
    params: [],
  });
});
