import { test } from "node:test";
import assert from "node:assert/strict";
import { ProduceExams, Stages } from "gakumas-data";

test("produce exams parse their gifts and stay out of Stages", () => {
  const exam = ProduceExams.getById(1);
  assert.equal(exam.type, "produceExam");
  assert.deepEqual(exam.turnCounts, { vocal: 3, dance: 3, visual: 5 });
  assert.equal(exam.effects.length, 3);
  assert.ok(Stages.getAll().every((stage) => stage.type != "produceExam"));
});
