import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PIdols, SkillCards } from "gakumas-data";
import {
  findIdolRoadLoadout,
  idolRoadLoadout,
  idolRoadStageCandidates,
  isIdolRoadScreen,
} from "../../../../../gakumas-tools/utils/imageProcessing/idolRoadImport.js";
import { readIdolRoadCards } from "../../../../../gakumas-tools/utils/imageProcessing/idolRoadLoadout.js";
import { loadImage } from "../../../../badges.mjs";

const FIXTURES = new URL("../../../../fixtures/", import.meta.url).pathname;
const REPO_ROOT = new URL("../../../../../", import.meta.url).pathname;
const LABELS = readFileSync(`${REPO_ROOT}tests/idolRoadLoadout.jsonl`, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

// The import on a labeled loadout, with the labels standing in for the
// classifier's reads (the harness checks those).
async function importLabeled(name, reversed = false) {
  const entry = LABELS.find((e) => e.files[0].endsWith(`/${name}.webp`));
  const images = await Promise.all(
    entry.files.map((file) => loadImage(REPO_ROOT + file)),
  );
  if (reversed) images.reverse();
  const idolRoad = findIdolRoadLoadout(images);
  assert.ok(idolRoad, `${name} is read as the Idol Road screen`);
  const { found } = idolRoad;
  const ids = found.slots.flatMap((row, r) =>
    row.flatMap((slot, c) => (slot ? [entry.skillCards[r][c]] : [])),
  );
  const ordered = idolRoad.order.map((i) => images[i]);
  const cards = readIdolRoadCards(ordered, found.slots, ids);
  return { entry, loadout: idolRoadLoadout(found, cards, entry.pItems.slice(1)) };
}

test("Idol Road: top and bottom screenshots give three rows, 重複 left out", async () => {
  const { entry, loadout } = await importLabeled("s10-g4");
  const expected = entry.skillCards.map((row) => [...row]);
  expected[2][0] = 0; // 重複: repeats the Main row's P-idol card.
  assert.deepEqual(loadout.skillCardIdGroups, expected);
  assert.deepEqual(loadout.customizationGroups[2][0], {});
  assert.equal(loadout.customizationGroups.length, 3);
  // STAGE 10 on 花海 咲季's road.
  assert.deepEqual(loadout.stageCandidates, [{ stageId: 207 }]);
  assert.equal(loadout.stageId, 207);
  // The chosen P-items only; the 固定 one is the stage's.
  assert.deepEqual(loadout.pItemIds, [402, 82, 404, 78]);
  // Shown percents in place of Vo/Da/Vi, then 体力.
  assert.deepEqual(loadout.params, [1233, 1671, 2190, 67]);
});

test("Idol Road: a top screenshot alone gives the rows it shows", async () => {
  const { entry, loadout } = await importLabeled("s10-d0");
  const expected = entry.skillCards.map((row) => [...row]);
  expected[0][3] = 0;
  assert.deepEqual(loadout.skillCardIdGroups, expected);
  assert.deepEqual(loadout.customizationGroups[0][3], {});
  assert.deepEqual(loadout.stageCandidates, [{ stageId: 207 }]);
  assert.deepEqual(loadout.params, [1041, 1671, 2190, 47]);
});

test("Idol Road: STAGE n of the P-idol's own road", () => {
  assert.deepEqual(idolRoadStageCandidates(1, 888), [{ stageId: 196 }]);
  assert.deepEqual(idolRoadStageCandidates(null, 888), []);
  // An idol whose road has no stages in the data yet.
  const other = SkillCards.getAll().find(
    (card) =>
      card.sourceType == "pIdol" && PIdols.getById(card.pIdolId)?.idolId == 2,
  );
  assert.deepEqual(idolRoadStageCandidates(10, other.id), []);
  // Not a P-idol card.
  assert.deepEqual(idolRoadStageCandidates(10, 1), []);
});

test("contest loadout screenshots aren't read as the Idol Road screen", async () => {
  const dir = `${FIXTURES}contest_loadout/`;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".webp"))) {
    assert.equal(isIdolRoadScreen(await loadImage(dir + file)), false, file);
  }
});

test("every labeled Idol Road top screenshot is read as the Idol Road screen", async () => {
  for (const entry of LABELS) {
    const image = await loadImage(REPO_ROOT + entry.files[0]);
    assert.equal(isIdolRoadScreen(image), true, entry.files[0]);
  }
});

test("Idol Road: the bottom screenshot may come first", async () => {
  const { loadout } = await importLabeled("s10-g4");
  const { loadout: reversed } = await importLabeled("s10-g4", true);
  assert.deepEqual(reversed, loadout);
});

test("Idol Road: a contest screenshot with it is an error", async () => {
  const images = await Promise.all(
    [
      "idol_road_loadout/s10-g4.webp",
      "contest_loadout/01.webp",
    ].map((file) => loadImage(FIXTURES + file)),
  );
  assert.throws(() => findIdolRoadLoadout(images), /Idol Road/);
  assert.equal(findIdolRoadLoadout([images[1]]), null);
});
