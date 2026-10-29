import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPHED_FIELDS } from "gakumas-engine";
import { mergeGraphDatas } from "../gakumas-tools/utils/simulator.js";

const graph = (values) =>
  Object.fromEntries(GRAPHED_FIELDS.map((field) => [field, values]));

test("graph merge weighs each worker by its runs per turn", () => {
  const { graphData, graphRunCounts } = mergeGraphDatas(
    [graph([10, 20, 30]), graph([40, 50])],
    [
      [3, 3, 1],
      [1, 1],
    ]
  );
  assert.deepEqual(graphRunCounts, [4, 4, 1]);
  assert.deepEqual(graphData[GRAPHED_FIELDS[0]], [17.5, 27.5, 30]);
});

test("graph merge of single runs is their plain mean", () => {
  const { graphData, graphRunCounts } = mergeGraphDatas([
    graph([1, 2]),
    graph([3]),
  ]);
  assert.deepEqual(graphRunCounts, [2, 1]);
  assert.deepEqual(graphData[GRAPHED_FIELDS[0]], [2, 2]);
});
