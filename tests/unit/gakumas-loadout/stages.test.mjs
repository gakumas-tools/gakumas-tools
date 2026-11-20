import { test } from "node:test";
import assert from "node:assert/strict";
import { ProduceExams } from "gakumas-data";
import { IdolConfig, IdolStageConfig, StageConfig } from "gakumas-engine";
import {
  FALLBACK_STAGE,
  getSimulatorUrl,
  getStage,
  knownStageId,
  loadoutFromSearchParams,
  loadoutToSearchParams,
  produceExamIdOf,
} from "gakumas-loadout";

const exam = ProduceExams.getById(1);
// r9's order, as the game showed it before the exam.
const ORDER = [
  "visual", "vocal", "visual", "dance", "visual", "vocal",
  "visual", "dance", "vocal", "dance", "visual",
];

test("exam-<id> resolves to the produce exam with its default order", () => {
  const stage = getStage("exam-1");
  assert.equal(stage.id, "exam-1");
  assert.equal(stage.type, "produceExam");
  assert.equal(stage.name, exam.name);
  assert.equal(stage.turnTypes.length, 11);
  assert.deepEqual(new StageConfig(stage).turnCounts, exam.turnCounts);
});

test("a given turn order is kept, a malformed one replaced", () => {
  assert.deepEqual(getStage("exam-1", { turnTypes: ORDER }).turnTypes, ORDER);
  const short = getStage("exam-1", { turnTypes: ORDER.slice(1) });
  assert.equal(short.turnTypes.length, 11);
  const bad = getStage("exam-1", { turnTypes: [...ORDER.slice(1), "x"] });
  assert.ok(bad.turnTypes.every((t) => t != "x"));
});

test("unknown exam ids are not stages", () => {
  assert.equal(produceExamIdOf("exam-999999"), null);
  assert.equal(produceExamIdOf("exam-1x"), null);
  assert.equal(produceExamIdOf(1), null);
  assert.equal(knownStageId("exam-999999"), null);
  assert.equal(knownStageId("exam-1"), "exam-1");
  assert.equal(getStage("exam-999999"), FALLBACK_STAGE);
});

test("the URL carries the exam and its turn order", () => {
  const base = loadoutFromSearchParams(new URLSearchParams());
  const loadout = { ...base, stageId: "exam-1", customStage: { turnTypes: ORDER } };
  const params = loadoutToSearchParams(loadout);
  assert.equal(params.get("stage"), "exam-1");
  assert.equal(params.get("turns"), "vi-vo-vi-da-vi-vo-vi-da-vo-da-vi");
  const back = loadoutFromSearchParams(new URLSearchParams(params.toString()));
  assert.equal(back.stageId, "exam-1");
  assert.deepEqual(back.customStage.turnTypes, ORDER);
  assert.ok(getSimulatorUrl(loadout, [loadout]).includes("stage=exam-1"));
});

test("a URL with a bad turn order falls back to the default order", () => {
  const back = loadoutFromSearchParams(
    new URLSearchParams("stage=exam-1&turns=vo-xx"),
  );
  assert.equal(back.stageId, "exam-1");
  assert.deepEqual(back.customStage, {});
  assert.equal(getStage(back.stageId, back.customStage).turnTypes.length, 11);
});

test("a produce exam adds no default cards", () => {
  const base = loadoutFromSearchParams(new URLSearchParams());
  const config = new IdolStageConfig(
    new IdolConfig({ ...base, stageId: "exam-1" }),
    new StageConfig(getStage("exam-1", { turnTypes: ORDER })),
    true,
  );
  assert.deepEqual(config.defaultCardIds, []);
  assert.deepEqual(config.stage.turnTypes, ORDER);
});
