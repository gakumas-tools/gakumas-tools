import SKILL_CARDS from "../csv/skill_cards.csv";
import PLUS_PLUS_CARDS from "../csv/skill_cards_plus_plus.csv";
import { getSkillCardContestPower } from "../utils/contestPower";
import { deserializeEffectSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

SKILL_CARDS.forEach((skillCard) => {
  skillCard._type = "skillCard";
  // A single id is parsed as a number, so split its string form.
  skillCard.availableCustomizations = String(
    skillCard.availableCustomizations ?? "",
  )
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

// ++ cards (skill_cards_plus_plus.csv, id = 10000 + the + card's id) exist
// only inside a lesson or exam, when スキルカードサポート
// upgrades a + card. They are looked up by id but are never listed, so card
// pickers, images and the classifiers don't see them.
PLUS_PLUS_CARDS.forEach((skillCard) => {
  skillCard._type = "skillCard";
  skillCard.availableCustomizations = [];
  skillCard.limit = skillCard.limit || null;
  skillCard.pIdolId = skillCard.pIdolId || null;
  skillCard.upgradeLevel = 2;
  skillCard.contestPower = getSkillCardContestPower(skillCard);
});

const parsedPlusPlus = lazyParse(PLUS_PLUS_CARDS, (skillCard) => {
  skillCard.conditions = deserializeEffectSequence(skillCard.conditions);
  skillCard.cost = deserializeEffectSequence(skillCard.cost);
  skillCard.actions = deserializeEffectSequence(skillCard.actions);
  skillCard.effects = deserializeEffectSequence(skillCard.effects);
});

const SKILL_CARDS_BY_ID = SKILL_CARDS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, Object.create(null));

const PLUS_PLUS_BY_ID = PLUS_PLUS_CARDS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, Object.create(null));

const PLUS_PLUS_BY_FROM_ID = PLUS_PLUS_CARDS.reduce((acc, cur) => {
  acc[cur.fromId] = cur;
  return acc;
}, Object.create(null));

class SkillCards {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    if (PLUS_PLUS_BY_ID[id]) return parsedPlusPlus.one(PLUS_PLUS_BY_ID[id]);
    return parsed.one(SKILL_CARDS_BY_ID[id]);
  }

  // The ++ card スキルカードサポート turns this + card into, if the game has one.
  static getPlusPlus(id) {
    const skillCard = PLUS_PLUS_BY_FROM_ID[id];
    return skillCard ? parsedPlusPlus.one(skillCard) : null;
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
