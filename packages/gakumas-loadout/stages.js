import { Stages } from "gakumas-data";

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

export function getStage(stageId, customStage) {
  if (stageId == "custom") return customStage;
  return (stageId && Stages.getById(stageId)) || FALLBACK_STAGE;
}

export function knownStageId(stageId) {
  if (stageId == "custom" || (stageId && Stages.getById(stageId))) {
    return stageId;
  }
  return null;
}
