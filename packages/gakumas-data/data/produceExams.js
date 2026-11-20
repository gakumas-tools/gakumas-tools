import PRODUCE_EXAMS from "../csv/produce_exams.csv";
import { deserializeEffectSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

// Exams inside a produce (中間試験, 最終試験). Unlike contest stages, the
// game shows the turn order before the exam and it changes between runs,
// so the player supplies it (StageConfig turnTypes). turnCounts is the
// split seen in game, kept for display. effects are the 応援 gifts.
// These rows are not in Stages, so stage pickers don't list them.

PRODUCE_EXAMS.forEach((exam) => {
  const [vocal, dance, visual] = String(exam.turnCounts)
    .split(",")
    .map((p) => parseInt(p, 10));
  exam.turnCounts = { vocal, dance, visual };
  exam.type = "produceExam";
});

const parsed = lazyParse(PRODUCE_EXAMS, (exam) => {
  exam.effects = deserializeEffectSequence(exam.effects);
});

const BY_ID = PRODUCE_EXAMS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, Object.create(null));

class ProduceExams {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    return parsed.one(BY_ID[id]);
  }
}

export default ProduceExams;
