import {
  Customizations,
  deserializeEffectSequence,
  PDrinks,
  PIdols,
  PItems,
  SkillCards,
} from "gakumas-data";
import { getBaseId, isUniqueCard } from "../utils";

export const MAX_P_DRINKS = 3;

export default class IdolConfig {
  constructor(loadout) {
    const {
      params,
      supportBonus,
      pItemIds,
      pDrinkIds,
      pDrinkTurns,
      skillCardIdGroups,
      customizationGroups,
      startStamina,
      memoryAbilities,
    } = loadout;

    let skillCardIds = [];
    let cards = [];
    let k = 0;
    for (let i = 0; i < skillCardIdGroups.length; i++) {
      for (let j = 0; j < skillCardIdGroups[i].length; j++) {
        if (skillCardIdGroups[i][j]) {
          let customizations = customizationGroups?.[i]?.[j];
          if (customizations) {
            customizations = { ...customizations };
            Object.keys(customizations).forEach((k) => {
              if (!Customizations.getById(k) || !customizations[k]) {
                delete customizations[k];
              }
            });
          }
          cards.push({
            id: skillCardIdGroups[i][j],
            customizations,
            index: k,
          });
          skillCardIds.push(skillCardIdGroups[i][j]);
        }
        k++;
      }
    }

    // P-items and skill cards
    this.pItemIds = [...new Set(pItemIds.filter((id) => id))];
    // Memory abilities (メモリーアビリティ): each an effect string in the
    // same language as a P-item's, held for the whole stage from its start,
    // as the ログ shows them granted at turn 1.
    this.memoryAbilityEffects = (memoryAbilities || [])
      .filter((effects) => effects)
      .map((effects) => deserializeEffectSequence(effects));
    // P-drinks (produce exams only). Up to 3, as in the game's drink slots;
    // the same drink may be held more than once, so no dedupe. Each may have
    // a turn set for it (pDrinkTurns, 1-based); one with none (null) is the
    // strategy's to time (StageEngine.usePDrink).
    const drinks = (pDrinkIds || [])
      .map((id, i) => ({ id, turn: parseInt(pDrinkTurns?.[i], 10) || null }))
      .filter((drink) => PDrinks.getById(drink.id))
      .slice(0, MAX_P_DRINKS);
    this.pDrinkIds = drinks.map((drink) => drink.id);
    this.pDrinkTurns = drinks.map((drink) =>
      drink.turn > 0 ? drink.turn : null,
    );
    const { dedupedCards, dupeIndices } = this.getDedupedCards(cards);
    dedupedCards.forEach((c) => {
      delete c.index;
    });
    this.cards = dedupedCards;
    this.dupeIndices = dupeIndices;

    // P-idol
    this.pIdolId = this.inferPIdolId(this.pItemIds, skillCardIds);
    const pIdol = PIdols.getById(this.pIdolId);
    if (pIdol) {
      this.idolId = pIdol.idolId;
      this.plan = pIdol.plan;
      this.recommendedEffect = pIdol.recommendedEffect;
    }
    if (!this.plan) {
      this.plan = this.inferPlan(this.pItemIds, skillCardIds);
    }

    // Params
    const [vocal, dance, visual, stamina] = params.map((p) => p || 0);
    this.params = { vocal, dance, visual, stamina };
    // The 体力 the stage starts at. A produce exam starts at the 体力 the run
    // had, which can be below max; heals still cap at params.stamina.
    this.startStamina =
      startStamina == null ? stamina : Math.max(0, Math.min(startStamina, stamina));
    this.supportBonus = supportBonus || 0;
  }

  inferPIdolId(pItemIds, skillCardIds) {
    const signatureSkillCardId = skillCardIds.find(
      (id) => SkillCards.getById(id)?.sourceType == "pIdol",
    );
    if (signatureSkillCardId)
      return SkillCards.getById(signatureSkillCardId).pIdolId;

    const signaturePItemId = pItemIds.find(
      (id) => PItems.getById(id)?.sourceType == "pIdol",
    );
    if (signaturePItemId) return PItems.getById(signaturePItemId).pIdolId;

    return null;
  }

  inferPlan(pItemIds, skillCardIds) {
    for (let id of skillCardIds) {
      const { plan } = SkillCards.getById(id);
      if (plan != "free") return plan;
    }
    for (let id of pItemIds) {
      const { plan } = PItems.getById(id);
      if (plan != "free") return plan;
    }
    return null;
  }

  countCustomizations(customizations) {
    if (!customizations) return 0;
    return Object.values(customizations).reduce((acc, cur) => acc + cur, 0);
  }

  // If the loadout contains dupes of a unique skill card,
  // keep only the most upgraded copy
  getDedupedCards(cards) {
    const sortedCards = cards.sort(
      (a, b) =>
        b.id +
        (b.customizations ? this.countCustomizations(b.customizations) : 0) -
        a.id -
        (a.customizations ? this.countCustomizations(a.customizations) : 0),
    );

    let dedupedCards = [];
    let dupeIndices = [];

    for (let i = 0; i < sortedCards.length; i++) {
      const skillCard = SkillCards.getById(sortedCards[i].id);
      if (isUniqueCard(skillCard)) {
        const baseId = getBaseId(skillCard);
        if (dedupedCards.some((d) => [baseId, baseId + 1].includes(d.id))) {
          dupeIndices.push(sortedCards[i].index);
          continue;
        }
      }
      dedupedCards.push(sortedCards[i]);
    }

    return {
      dedupedCards,
      dupeIndices,
    };
  }
}
