import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  getReferenceStage,
  groupedStages,
  stagePath,
  stagePaths,
  stageTurns,
} from "../../../../gakumas-tools/utils/stageReference.js";

test("getReferenceStage finds game stages by a plain id only", () => {
  const stage = Stages.getAll()[0];
  assert.equal(getReferenceStage(String(stage.id))?.id, stage.id);
  assert.equal(getReferenceStage(`0${stage.id}`), null);
  assert.equal(getReferenceStage("custom"), null);
  assert.equal(getReferenceStage("999999"), null);
  assert.equal(getReferenceStage("1.5"), null);
});

test("groupedStages groups by kind, newest season first, in stage order", () => {
  const stages = [
    { id: 1, type: "contest", season: 1, stage: 2 },
    { id: 2, type: "contest", season: 2, stage: 3 },
    { id: 3, type: "contest", season: 2, stage: 1 },
    { id: 4, type: "idolRoad", season: "", stage: 2 },
    { id: 5, type: "idolRoad", season: "", stage: 1 },
    { id: 6, type: "custom" },
  ];
  assert.deepEqual(
    groupedStages(stages).map((g) => [g.type, g.stages.map((s) => s.id)]),
    [
      ["idolRoad", [5, 4]],
      ["contest", [3, 2, 1]],
    ],
  );
});

test("stagePaths has one page per game stage", () => {
  const paths = stagePaths();
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(
    paths.length,
    Stages.getAll().filter((s) => getReferenceStage(s.id)).length,
  );
  assert.ok(paths.includes(stagePath(Stages.getAll()[0].id)));
});

test("stageTurns counts each kind and the total", () => {
  assert.deepEqual(
    stageTurns({ turnCounts: { vocal: 3, dance: 4, visual: 5 } }),
    { counts: [3, 4, 5], total: 12 },
  );
  assert.deepEqual(stageTurns({}), { counts: [0, 0, 0], total: 0 });
});
