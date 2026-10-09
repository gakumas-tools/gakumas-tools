import { PDrinks, PIdols, PItems, SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import {
  comparePDrinks,
  comparePIdols,
  comparePItems,
  compareSkillCards,
} from "@/utils/sort";

export const EntityTypes = {
  P_ITEM: "P_ITEM",
  SKILL_CARD: "SKILL_CARD",
  P_DRINK: "P_DRINK",
  P_IDOL: "P_IDOL",
};

export const ENTITY_DATA_BY_TYPE = {
  [EntityTypes.P_ITEM]: PItems,
  [EntityTypes.SKILL_CARD]: SkillCards,
  [EntityTypes.P_DRINK]: PDrinks,
  [EntityTypes.P_IDOL]: PIdols,
};

export const COMPARE_FN_BY_TYPE = {
  [EntityTypes.P_ITEM]: comparePItems,
  [EntityTypes.SKILL_CARD]: compareSkillCards,
  [EntityTypes.P_DRINK]: comparePDrinks,
  [EntityTypes.P_IDOL]: comparePIdols,
};

// First non-upgraded signature skill card per p-idol id; used as a fallback
// icon when a p-idol has no portrait of its own.
export const SIGNATURE_CARD_BY_PIDOL = SkillCards.getAll().reduce((acc, sc) => {
  if (sc.pIdolId && !sc.upgraded && !acc[sc.pIdolId]) acc[sc.pIdolId] = sc;
  return acc;
}, {});

// Entities that should be hidden from any user-facing browser/picker.
export const HIDDEN_ITEM_IDS = new Set([]);
export const HIDDEN_CARD_IDS = new Set([]);

export function isEntityHidden(type, id) {
  if (type === EntityTypes.SKILL_CARD) return HIDDEN_CARD_IDS.has(id);
  if (type === EntityTypes.P_ITEM) return HIDDEN_ITEM_IDS.has(id);
  return false;
}

// Resolve a renderable icon for an entity. P-idols without their own portrait
// fall back to their signature skill card.
export function resolveEntityIcon(entity, idolId) {
  if (!entity) return null;
  let imageEntity = entity;
  let imageIdolId = idolId;
  if (entity._type === "pIdol") {
    const sigCard = SIGNATURE_CARD_BY_PIDOL[entity.id];
    if (sigCard) {
      imageEntity = sigCard;
      imageIdolId = entity.idolId;
    }
  }
  return gkImg(imageEntity, imageIdolId).icon;
}
