import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateContestPower } from "../../../../gakumas-tools/utils/contestPower.js";

const { memories } = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/ingame/contest-power.json", import.meta.url),
    "utf8",
  ),
);

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
