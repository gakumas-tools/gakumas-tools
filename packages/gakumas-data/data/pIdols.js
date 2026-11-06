import P_IDOLS from "../csv/p_idols.csv";

P_IDOLS.forEach((pIdol) => {
  pIdol._type = "pIdol";
});

const P_IDOLS_BY_ID = P_IDOLS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, Object.create(null));

class PIdols {
  static getAll() {
    return P_IDOLS;
  }

  static getById(id) {
    return P_IDOLS_BY_ID[id];
  }

  static getFiltered({ idolIds, rarities, plans, recommendedEffects }) {
    return P_IDOLS.filter((pIdol) => {
      if (idolIds && !idolIds.includes(pIdol.idolId)) return false;
      if (rarities && !rarities.includes(pIdol.rarity)) return false;
      if (plans && !plans.includes(pIdol.plan)) return false;
      if (
        recommendedEffects &&
        !recommendedEffects.includes(pIdol.recommendedEffect)
      )
        return false;
      return true;
    });
  }
}

export default PIdols;
