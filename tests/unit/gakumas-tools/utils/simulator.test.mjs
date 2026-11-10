import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPHED_FIELDS } from "gakumas-engine";
import {
  accumulateCardUsage,
  bucketScores,
  createGraphAverage,
  mergeGraphDatas,
} from "../../../../gakumas-tools/utils/simulator.js";

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

test("a graph average read early keeps its values as runs are added", () => {
  const average = createGraphAverage();
  average.add(graph([10]));
  const early = average.result();
  average.add(graph([30, 40]));
  assert.deepEqual(early.graphRunCounts, [1]);
  assert.deepEqual(early.graphData[GRAPHED_FIELDS[0]], [10]);
  assert.deepEqual(average.result().graphData[GRAPHED_FIELDS[0]], [20, 40]);
});

test("score buckets list in ascending order with no bucket below 0", () => {
  const { bucketedScores, bucketSize } = bucketScores([0, 500, 1500, 3200]);
  const keys = Object.keys(bucketedScores).map(Number);
  assert.deepEqual(
    keys,
    [...keys].sort((a, b) => a - b),
  );
  assert.ok(keys.every((k) => k >= 0));
  assert.equal(
    Object.values(bucketedScores).reduce((a, b) => a + b, 0),
    4,
  );
  assert.ok(bucketSize > 0);
});

test("a card played, drawn again and played again counts two draws", () => {
  const hand = (ids, selectedIndex) => ({
    logType: "hand",
    data: { handCards: ids.map((id) => ({ id })), selectedIndex },
  });
  const cardUsage = {};
  accumulateCardUsage(
    [
      { logType: "startTurn" },
      hand([757, 132, 21], 0),
      hand([132, 21, 757], 2),
    ],
    cardUsage,
  );
  const usage = Object.values(cardUsage.turns[0]).find((u) => u.id === 757);
  assert.deepEqual([usage.use, usage.draw], [2, 2]);
});

test("re-showing the same hand doesn't count extra draws", () => {
  const cardUsage = {};
  accumulateCardUsage(
    [
      { logType: "startTurn" },
      {
        logType: "hand",
        data: { handCards: [{ id: 1 }, { id: 2 }], selectedIndex: null },
      },
      {
        logType: "hand",
        data: { handCards: [{ id: 1 }, { id: 2 }], selectedIndex: 0 },
      },
    ],
    cardUsage,
  );
  const usage = Object.values(cardUsage.turns[0]).find((u) => u.id === 1);
  assert.deepEqual([usage.use, usage.draw], [1, 1]);
});
