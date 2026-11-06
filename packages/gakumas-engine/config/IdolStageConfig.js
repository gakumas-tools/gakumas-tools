import { calculateTypeMultipliers } from "../typeMultipliers";

const CONTEST_DEFAULT_CARD_IDS_BY_PLAN = {
  sense: [5, 7, 1, 1, 15, 15, 17, 17],
  logic: [9, 11, 19, 19, 21, 21, 13, 13],
  anomaly: [370, 372, 1, 1, 374, 374, 376, 376],
};

const EVENT_DEFAULT_CARD_IDS_BY_RECOMMENDED_EFFECT = {
  goodConditionTurns: [15, 15, 5, 1, 1, 3, 13, 13],
  concentration: [17, 17, 7, 1, 1, 3, 13, 13],
  goodImpressionTurns: [19, 19, 9, 1, 1, 3, 13, 13],
  motivation: [21, 21, 11, 1, 1, 3, 13, 13],
  strength: [376, 376, 370, 1, 1, 368, 13, 13],
  fullPower: [370, 372, 1, 1, 374, 374, 376, 376], // TODO: Fix
};

export default class IdolStageConfig {
  constructor(idolConfig, stageConfig, enterPercents) {
    this.idol = idolConfig;
    this.stage = stageConfig;
    this.typeMultipliers = this.calculateTypeMultipliers(
      idolConfig,
      stageConfig,
      enterPercents
    );
    this.defaultCardIds = this.getDefaultCardIds(idolConfig, stageConfig);
  }

  calculateTypeMultipliers(idolConfig, stageConfig, enterPercents) {
    return calculateTypeMultipliers(
      idolConfig.params,
      stageConfig,
      idolConfig.supportBonus,
      enterPercents,
    );
  }

  getDefaultCardIds(idolConfig, stageConfig) {
    if (stageConfig.type === "linkContest") {
      return [];
    }
    const defaultCardSet = stageConfig.defaultCardSet || stageConfig.type;
    if (defaultCardSet == "event" && idolConfig.recommendedEffect) {
      if (stageConfig.season >= 4) {
        return [];
      }
      // Recommended effects without an event deck here (preservation) use
      // their plan's contest deck below.
      const eventCardIds =
        EVENT_DEFAULT_CARD_IDS_BY_RECOMMENDED_EFFECT[
          idolConfig.recommendedEffect
        ];
      if (eventCardIds) return eventCardIds;
    }
    if (idolConfig.plan) {
      return CONTEST_DEFAULT_CARD_IDS_BY_PLAN[idolConfig.plan];
    } else if (stageConfig.plan != "free") {
      return CONTEST_DEFAULT_CARD_IDS_BY_PLAN[stageConfig.plan];
    } else {
      return CONTEST_DEFAULT_CARD_IDS_BY_PLAN.sense;
    }
  }
}
