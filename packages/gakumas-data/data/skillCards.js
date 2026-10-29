import SKILL_CARDS from "../csv/skill_cards.csv";
import { getSkillCardContestPower } from "../utils/contestPower";
import { deserializeEffectSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

SKILL_CARDS.forEach((skillCard) => {
  skillCard._type = "skillCard";
  skillCard.availableCustomizations = skillCard.availableCustomizations
    .split(",")
    .filter((c) => c);
  skillCard.limit = skillCard.limit || null;
  skillCard.pIdolId = skillCard.pIdolId || null;
  skillCard.contestPower = getSkillCardContestPower(skillCard);
});

const parsed = lazyParse(SKILL_CARDS, (skillCard) => {
  skillCard.conditions = deserializeEffectSequence(skillCard.conditions);
  skillCard.cost = deserializeEffectSequence(skillCard.cost);
  skillCard.actions = deserializeEffectSequence(skillCard.actions);
  skillCard.effects = deserializeEffectSequence(skillCard.effects);
});

const SKILL_CARDS_BY_ID = SKILL_CARDS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, {});

class SkillCards {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    return parsed.one(SKILL_CARDS_BY_ID[id]);
  }

  static getFiltered({
    rarities,
    types,
    plans,
    unlockPlvs,
    sourceTypes,
    pIdolIds,
  }) {
    return SKILL_CARDS.filter((skillCard) => {
      if (rarities && !rarities.includes(skillCard.rarity)) return false;
      if (types && !types.includes(skillCard.type)) return false;
      if (plans && !plans.includes(skillCard.plan)) return false;
      if (unlockPlvs && !unlockPlvs.includes(skillCard.unlockPlv)) return false;
      if (sourceTypes && !sourceTypes.includes(skillCard.sourceType))
        return false;
      if (pIdolIds && !pIdolIds.includes(skillCard.pIdolId)) return false;
      return true;
    }).map(parsed.one);
  }
}

export default SkillCards;
