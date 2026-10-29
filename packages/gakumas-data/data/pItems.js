import P_ITEMS from "../csv/p_items.csv";
import { getPItemContestPower } from "../utils/contestPower";
import { deserializeEffectSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

P_ITEMS.forEach((pItem) => {
  pItem._type = "pItem";
  pItem.pIdolId = pItem.pIdolId || null;
  pItem.contestPower = getPItemContestPower(pItem);
});

const parsed = lazyParse(P_ITEMS, (pItem) => {
  pItem.effects = deserializeEffectSequence(pItem.effects);
});

const P_ITEMS_BY_ID = P_ITEMS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, {});

class PItems {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    return parsed.one(P_ITEMS_BY_ID[id]);
  }

  static getFiltered({ rarities, plans, modes, sourceTypes, pIdolIds }) {
    return P_ITEMS.filter((pItem) => {
      if (rarities && !rarities.includes(pItem.rarity)) return false;
      if (plans && !plans.includes(pItem.plan)) return false;
      if (modes && !modes.includes(pItem.mode)) return false;
      if (sourceTypes && !sourceTypes.includes(pItem.sourceType)) return false;
      if (pIdolIds && !pIdolIds.includes(pItem.pIdolId)) return false;
      return true;
    }).map(parsed.one);
  }
}

export default PItems;
