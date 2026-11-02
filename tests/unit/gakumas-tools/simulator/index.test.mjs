import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  resetRand,
} from "gakumas-engine";
import { createSimulation } from "../../../../gakumas-tools/simulator/index.js";

function simulation() {
  const idol = new IdolConfig({
    params: [100, 200, 300, 50],
    pItemIds: [],
    skillCardIdGroups: [[1, 13]],
    customizationGroups: [[{}, {}]],
  });
  const stage = new StageConfig(Stages.getById(1));
  return createSimulation(
    new IdolStageConfig(idol, stage),
    null,
    "HeuristicStrategy",
  );
}

test("runs in two chunks give the same result as one batch", async () => {
  resetRand(12345);
  const batch = simulation();
  await batch.run(10);

  resetRand(12345);
  const chunked = simulation();
  await chunked.run(4);
  await chunked.run(6);

  assert.deepEqual(chunked.result(), batch.result());
});
