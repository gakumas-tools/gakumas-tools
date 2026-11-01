import { PItems, SkillCards } from "gakumas-data";
import { getOtherVersionId } from "@/utils/upgrades";

export const RARITY_VALUES = {
  N: 0,
  T: 1,
  R: 2,
  SR: 3,
  SSR: 4,
  L: 5,
};

const SOURCE_TYPE_VALUES = {
  produce: 0,
  pIdol: 1,
  support: 2,
};

const PLAN_VALUES = {
  free: 0,
  sense: 1,
  logic: 2,
  anomaly: 3,
};

const TYPE_VALUES = {
  trouble: 0,
  active: 1,
  mental: 2,
};

export function comparePDrinks(a, b) {
  if (a.rarity != b.rarity) {
    return RARITY_VALUES[a.rarity] - RARITY_VALUES[b.rarity];
  }
  if (a.plan != b.plan) {
    return PLAN_VALUES[a.plan] - PLAN_VALUES[b.plan];
  }
  return 0;
}

export function comparePItems(a, b) {
  if (a.rarity != b.rarity) {
    return RARITY_VALUES[a.rarity] - RARITY_VALUES[b.rarity];
  }
  if (a.sourceType != b.sourceType) {
    return SOURCE_TYPE_VALUES[a.sourceType] - SOURCE_TYPE_VALUES[b.sourceType];
  }
  if (a.plan != b.plan) {
    return PLAN_VALUES[a.plan] - PLAN_VALUES[b.plan];
  }
  if (a.pIdolId != b.pIdolId) {
    return a.pIdolId - b.pIdolId;
  }
  return 0;
}

export function compareSkillCards(a, b) {
  if (a.rarity != b.rarity) {
    return RARITY_VALUES[a.rarity] - RARITY_VALUES[b.rarity];
  }
  if (a.sourceType != b.sourceType) {
    return SOURCE_TYPE_VALUES[a.sourceType] - SOURCE_TYPE_VALUES[b.sourceType];
  }
  if (a.unlockPlv != b.unlockPlv) {
    return a.unlockPlv - b.unlockPlv;
  }
  if (a.plan != b.plan) {
    return PLAN_VALUES[a.plan] - PLAN_VALUES[b.plan];
  }
  if (a.pIdolId != b.pIdolId) {
    return a.pIdolId - b.pIdolId;
  }
  if (a.type != b.type) {
    return TYPE_VALUES[a.type] - TYPE_VALUES[b.type];
  }
  return 0;
}

export function comparePIdols(a, b) {
  if (a.rarity != b.rarity) {
    return RARITY_VALUES[a.rarity] - RARITY_VALUES[b.rarity];
  }
  if (a.plan != b.plan) {
    return PLAN_VALUES[a.plan] - PLAN_VALUES[b.plan];
  }
  return a.idolId - b.idolId;
}

export function compareStages(a, b) {
  if (a.season != b.season) {
    return b.season - a.season;
  }
  return a.stage - b.stage;
}

export function getSearchScore(memory, pItemIds, skillCardIds) {
  let score = 0;
  pItemIds
    .filter((i) => !!i)
    .map(PItems.getById)
    .forEach((pItem, i) => {
      const multiplier = Math.pow(0.95, i);
      if (memory.pItemIds.includes(pItem.id)) score += 1 * multiplier;
      if (pItem.sourceType == "pIdol") {
        const otherId = getOtherVersionId(PItems, pItem);
        if (otherId != null && memory.pItemIds.includes(otherId))
          score += (pItem.upgraded ? 0.5 : 0.6) * multiplier;
      }
    });
  skillCardIds
    .filter((i) => !!i)
    .map(SkillCards.getById)
    .forEach((skillCard, i) => {
      const multiplier = Math.pow(0.95, i);
      if (memory.skillCardIds.includes(skillCard.id)) score += 1 * multiplier;
      if (skillCard.type != "trouble") {
        const otherId = getOtherVersionId(SkillCards, skillCard);
        if (otherId != null && memory.skillCardIds.includes(otherId))
          score += (skillCard.upgraded ? 0.5 : 0.6) * multiplier;
      }
    });
  return score;
}

export function compareFilteredMemories(a, b) {
  if (b.searchScore != a.searchScore) {
    return b.searchScore - a.searchScore;
  } else {
    return b.contestPower - a.contestPower;
  }
}

export function compareUnfilteredMemories(a, b) {
  if (b.name?.indexOf("(FIXME)") > -1) {
    return 1;
  } else if (a.name?.indexOf("(FIXME)") > -1) {
    return -1;
  } else {
    return b.contestPower - a.contestPower;
  }
}
