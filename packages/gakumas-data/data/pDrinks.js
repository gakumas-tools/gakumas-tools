import P_DRINKS from "../csv/p_drinks.csv";
import { deserializeEffectSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

P_DRINKS.forEach((pDrink) => {
  pDrink._type = "pDrink";
});

const parsed = lazyParse(P_DRINKS, (pDrink) => {
  pDrink.actions = deserializeEffectSequence(pDrink.actions);
});

const P_DRINKS_BY_ID = P_DRINKS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, {});

class PDrinks {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    return parsed.one(P_DRINKS_BY_ID[id]);
  }

  static getFiltered({ rarities, plans }) {
    return P_DRINKS.filter((pDrink) => {
      if (rarities && !rarities.includes(pDrink.rarity)) return false;
      if (plans && !plans.includes(pDrink.plan)) return false;
      return true;
    }).map(parsed.one);
  }
}

export default PDrinks;
