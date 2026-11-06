import IDOLS from "../csv/idols.csv";

IDOLS.forEach((idol) => {
  idol._type = "idol";
});

const IDOLS_BY_ID = IDOLS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, Object.create(null));

class Idols {
  static getAll() {
    return IDOLS;
  }

  static getById(id) {
    return IDOLS_BY_ID[id];
  }
}

export default Idols;
