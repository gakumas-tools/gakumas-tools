import { ProduceExams, Stages } from "gakumas-data";

const DEFAULT_PARAMS_BY_TREND_RANK = [2700, 2000, 800];
const DEFAULT_STAMINA = 50;

export const FALLBACK_STAGE = {
  id: "custom",
  type: "custom",
  plan: "free",
  turnCounts: { vocal: 4, dance: 4, visual: 4 },
  firstTurns: {
    vocal: 0.33,
    dance: 0.33,
    visual: 0.33,
  },
  criteria: {
    vocal: 0,
    dance: 0,
    visual: 0,
  },
  effects: [],
  linkTurnCounts: [],
};

export function getDefaultParams(stage) {
  const criteria = [
    stage.criteria.vocal,
    stage.criteria.dance,
    stage.criteria.visual,
  ];
  const trendOrder = [0, 1, 2].sort((a, b) => criteria[b] - criteria[a]);
  const params = [];
  trendOrder.forEach((paramIndex, rank) => {
    params[paramIndex] = DEFAULT_PARAMS_BY_TREND_RANK[rank];
  });
  return [...params, DEFAULT_STAMINA];
}

// Produce exams aren't in Stages. Their loadouts use the id "exam-<id>",
// and customStage carries the turn order the game showed.
const PRODUCE_EXAM_PREFIX = "exam-";
export const TURN_TYPES = ["vocal", "dance", "visual"];

export function produceExamStageId(examId) {
  return `${PRODUCE_EXAM_PREFIX}${examId}`;
}

export function produceExamIdOf(stageId) {
  if (typeof stageId != "string" || !stageId.startsWith(PRODUCE_EXAM_PREFIX)) {
    return null;
  }
  const rest = stageId.slice(PRODUCE_EXAM_PREFIX.length);
  if (!/^\d+$/.test(rest)) return null;
  const examId = parseInt(rest, 10);
  return ProduceExams.getById(examId) ? examId : null;
}

export function defaultTurnTypes(turnCounts) {
  return TURN_TYPES.flatMap((type) => Array(turnCounts[type]).fill(type));
}

function isValidTurnTypes(turnTypes, length) {
  return (
    Array.isArray(turnTypes) &&
    turnTypes.length == length &&
    turnTypes.every((type) => TURN_TYPES.includes(type))
  );
}

export function getProduceExamStage(examId, turnTypes) {
  const exam = ProduceExams.getById(examId);
  if (!exam) return null;
  const { vocal, dance, visual } = exam.turnCounts;
  return {
    ...exam,
    id: produceExamStageId(exam.id),
    produceExamId: exam.id,
    plan: "free",
    firstTurns: { vocal: 1 / 3, dance: 1 / 3, visual: 1 / 3 },
    criteria: { vocal: 0, dance: 0, visual: 0 },
    linkTurnCounts: [],
    turnTypes: isValidTurnTypes(turnTypes, vocal + dance + visual)
      ? [...turnTypes]
      : defaultTurnTypes(exam.turnCounts),
  };
}

export function getStage(stageId, customStage) {
  if (stageId == "custom") return customStage;
  const examId = produceExamIdOf(stageId);
  if (examId) return getProduceExamStage(examId, customStage?.turnTypes);
  return (stageId && Stages.getById(stageId)) || FALLBACK_STAGE;
}

export function knownStageId(stageId) {
  if (
    stageId == "custom" ||
    produceExamIdOf(stageId) ||
    (stageId && Stages.getById(stageId))
  ) {
    return stageId;
  }
  return null;
}
