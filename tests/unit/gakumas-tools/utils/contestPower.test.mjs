import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateContestPower } from "../../../../gakumas-tools/utils/contestPower.js";
import { inferCustomizations } from "../../../../gakumas-tools/utils/inferCustomizations.js";
import { hasIngameFixtures, loadIngameFixture } from "../../../ingameFixtures.mjs";

const { memories } = hasIngameFixtures
  ? loadIngameFixture("contest-power")
  : { memories: [] };

for (const memory of memories) {
  test(`${memory.name} (${memory.power}) has its captured contest power`, () => {
    assert.equal(
      calculateContestPower(
        memory.params,
        memory.pItemIds,
        memory.skillCardIds,
      ),
      memory.power,
    );
  });
}

test("customized Campus mode!! Lilja has its captured contest power", () => {
  const memory = readFileSync(
    new URL("../../../memoryBoxes.jsonl", import.meta.url),
    "utf8",
  )
    .trim()
    .split("\n")
    .map(JSON.parse)
    .find((memory) => memory.file === "tests/fixtures/memory/01.png");
  const customizations = memory.skillCards.map((id, i) => {
    const [dot, score, genki, cost] = memory.badges[i];
    return inferCustomizations(id, { dot, score, genki, cost });
  });

  assert.equal(
    calculateContestPower(
      memory.params,
      memory.pItems,
      memory.skillCards,
      customizations,
    ),
    18606,
  );
});
