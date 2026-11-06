import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBoxPlotData,
  stageSampleSizes,
} from "../../../../../gakumas-tools/components/Rehearsal/rehearsalStats.js";

const row = (scores, flags = ["ok", "ok", "ok"]) => ({ scores, flags });
const full = [
  [100, 200, 300],
  [400, 500, 600],
  [700, 800, 900],
];

test("counts each stage's scores, leaving out flagged stages and blank rows", () => {
  const data = [
    row(full),
    row(full),
    row(full, ["ok", "flagged", "ok"]),
    row([
      [100, 200, 300],
      [0, 0, 0],
      [0, 0, 0],
    ]),
    row([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]),
  ];
  assert.deepEqual(stageSampleSizes(buildBoxPlotData(data)), [4, 2, 3]);
});

test("counts a stage with one misread param by its other params", () => {
  const data = [
    row(full),
    row([
      [100, 0, 300],
      [400, 500, 600],
      [700, 800, 900],
    ]),
  ];
  assert.deepEqual(stageSampleSizes(buildBoxPlotData(data)), [2, 2, 2]);
});

test("counts nothing before any rows are added", () => {
  assert.deepEqual(stageSampleSizes(buildBoxPlotData([])), [0, 0, 0]);
});
