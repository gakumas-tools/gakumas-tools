import { test } from "node:test";
import assert from "node:assert/strict";
import { PItems, Stages } from "gakumas-data";
import { GRAPHED_FIELDS, IdolConfig } from "gakumas-engine";
import { FALLBACK_STAGE } from "../../../../gakumas-tools/simulator/constants.js";
import {
  accumulateCardUsage,
  bucketScores,
  createGraphAverage,
  getSimulatorUrl,
  getStage,
  knownStageId,
  loadoutFromSearchParams,
  loadoutToSearchParams,
  loadoutsFromSearchParams,
  loadoutsToSearchParams,
  mergeGraphDatas,
} from "../../../../gakumas-tools/utils/simulator.js";

const UNKNOWN_ID = 999999;
const knownStage = Stages.getAll()[0];
const customStage = { ...FALLBACK_STAGE, name: "Mine" };

const loadout = loadoutFromSearchParams(new URLSearchParams());

const graph = (values) =>
  Object.fromEntries(GRAPHED_FIELDS.map((field) => [field, values]));

const roundTrip = (supportBonus) =>
  loadoutFromSearchParams(
    new URLSearchParams(
      loadoutToSearchParams({ ...loadout, supportBonus }).toString(),
    ),
  ).supportBonus;

test("getStage resolves known, custom and missing stages", () => {
  assert.equal(getStage(knownStage.id), knownStage);
  assert.equal(getStage("custom", customStage), customStage);
  assert.equal(getStage(null), FALLBACK_STAGE);
});

test("getStage falls back for an unknown stage id", () => {
  assert.equal(getStage(UNKNOWN_ID), FALLBACK_STAGE);
});

test("knownStageId drops unknown ids", () => {
  assert.equal(knownStageId(knownStage.id), knownStage.id);
  assert.equal(knownStageId("custom"), "custom");
  assert.equal(knownStageId(UNKNOWN_ID), null);
  assert.equal(knownStageId(undefined), null);
});

test("loadoutFromSearchParams drops an unknown stage id", () => {
  const loadout = loadoutFromSearchParams(
    new URLSearchParams(`stage=${UNKNOWN_ID}`)
  );
  assert.equal(loadout.stageId, null);
  assert.ok(loadout.hasDataFromParams);
});

test("getSimulatorUrl has no URL for a stage it can't resolve", () => {
  assert.equal(getSimulatorUrl({ ...loadout, stageId: UNKNOWN_ID }, []), null);
  assert.match(getSimulatorUrl(loadout, [loadout]), /stage=/);
});

test("support bonus survives a URL round trip", () => {
  for (const supportBonus of [0, 0.1, 0.25]) {
    assert.equal(roundTrip(supportBonus), supportBonus);
  }
});

test("a missing support bonus loads as the default", () => {
  assert.equal(loadout.supportBonus, 0.1);
  assert.equal(roundTrip(null), 0.1);
});

test("percentage input survives a URL round trip", () => {
  const percents = { ...loadout, enterPercents: true };
  const restored = loadoutFromSearchParams(loadoutToSearchParams(percents));
  assert.equal(restored.enterPercents, true);
  const linked = loadoutsFromSearchParams(
    loadoutsToSearchParams([percents, percents]),
  );
  assert.ok(linked.every((l) => l.enterPercents));
});

test("a URL without enter_percents=1 loads raw stats", () => {
  assert.equal(loadoutToSearchParams(loadout).has("enter_percents"), false);
  for (const query of ["", "enter_percents=0", "enter_percents=true"]) {
    const params = new URLSearchParams(query);
    assert.equal(loadoutFromSearchParams(params).enterPercents, false);
  }
});

test("a URL with only enter_percents=1 counts as URL data", () => {
  const params = new URLSearchParams("enter_percents=1");
  assert.ok(loadoutFromSearchParams(params).hasDataFromParams);
});

test("an unreadable support bonus loads as none", () => {
  for (const value of ["abc", ""]) {
    const params = new URLSearchParams({ support_bonus: value });
    assert.equal(loadoutFromSearchParams(params).supportBonus, null);
  }
});

test("a malformed link phase is skipped and the others still load", () => {
  const params = loadoutsToSearchParams([
    loadout,
    { ...loadout, params: [100, 200, 300, 40] },
  ]);
  params.append("loadout", "%");
  params.append("loadout", "%E0%A4%A");
  const restored = loadoutsFromSearchParams(
    new URLSearchParams(params.toString()),
  );
  assert.deepEqual(
    restored.map((l) => l.params),
    [loadout.params, [100, 200, 300, 40]],
  );
});

test("unknown card and item ids load as empty slots", () => {
  const item = PItems.getAll()[0];
  const params = new URLSearchParams({
    stage: "187",
    items: `${item.id}-${UNKNOWN_ID}-0`,
    cards: `25-${UNKNOWN_ID}-0`,
    customizations: "65x1-65x1-",
  });
  const restored = loadoutFromSearchParams(params);
  assert.deepEqual(restored.pItemIds, [item.id, 0, 0]);
  assert.deepEqual(restored.skillCardIdGroups, [[25, 0, 0]]);
  assert.deepEqual(restored.customizationGroups, [[{ 65: 1 }, {}, {}]]);
  assert.doesNotThrow(() => new IdolConfig(restored));
});

test("a URL loads only the customizations each card can have", () => {
  const params = new URLSearchParams({
    stage: "187",
    cards: "25-25-1",
    customizations: "65x1-65x10e21x1-65x1",
  });
  assert.deepEqual(loadoutFromSearchParams(params).customizationGroups, [
    [{ 65: 1 }, {}, {}],
  ]);
});

test("empty customization slots keep later cards' customizations in place", () => {
  const source = {
    ...loadout,
    skillCardIdGroups: [[25, 25, 25]],
    customizationGroups: [[null, { 65: 1 }, undefined]],
  };
  const restored = loadoutFromSearchParams(loadoutToSearchParams(source));
  assert.deepEqual(restored.customizationGroups, [[{}, { 65: 1 }, {}]]);
});

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
