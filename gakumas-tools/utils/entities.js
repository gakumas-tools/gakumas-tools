import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  PDrinks,
  PIdols,
  PItems,
  SkillCards,
} from "gakumas-data";
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

export function isEntityHidden(type, id) {
  if (type === EntityTypes.SKILL_CARD) return HIDDEN_CARD_IDS.has(id);
  if (type === EntityTypes.P_ITEM) return HIDDEN_ITEM_IDS.has(id);
  return false;
}

// Entities an EntityBank offers. With the plan/idol filter on: the idol's
// signature entities for the plan, then everything else a Stage memory can
// hold for that plan.
export function getBankEntities(type, { filter, plan, idolId }) {
  const Entities = ENTITY_DATA_BY_TYPE[type];
  const compareFn = COMPARE_FN_BY_TYPE[type];

  if (!filter) return [...Entities.getAll()].sort(compareFn);

  let signatureEntities = [];
  if (type !== EntityTypes.P_DRINK) {
    const pIdolIds = PIdols.getFiltered({
      idolIds: [idolId],
      plans: [plan],
    }).map((pi) => pi.id);
    signatureEntities = Entities.getFiltered({
      pIdolIds,
    });
  }

  const nonSignatureEntities = Entities.getFiltered({
    // Default cards are all N, and a memory's Stage deck can hold them.
    rarities: ["N", "R", "SR", "SSR", "L"],
    plans: [plan, "free"],
    modes: ["stage"],
    sourceTypes: ["default", "produce", "support"],
    pIdolIds: [null],
  }).sort(compareFn);

  return signatureEntities.concat(nonSignatureEntities);
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
