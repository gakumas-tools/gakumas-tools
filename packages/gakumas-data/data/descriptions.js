import DESCRIPTIONS from "../csv/descriptions.csv";

const DESCRIPTION_BY_ENTITY = DESCRIPTIONS.reduce((acc, cur) => {
  acc[`${cur.type}:${cur.id}`] = cur.description;
  return acc;
}, {});

class Descriptions {
  // The entity's description as the game shows it, a line per effect.
  static get(entity) {
    return DESCRIPTION_BY_ENTITY[`${entity._type}:${entity.id}`] || null;
  }
}

export default Descriptions;
