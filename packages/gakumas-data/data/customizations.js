import CUSTOMIZATIONS from "../csv/customizations.csv";
import { deserializePatchSequence } from "../utils/effects";
import { lazyParse } from "../utils/lazyParse";

const parsed = lazyParse(CUSTOMIZATIONS, (customization) => {
  customization.conditions = deserializePatchSequence(customization.conditions);
  customization.cost = deserializePatchSequence(customization.cost);
  customization.actions = deserializePatchSequence(customization.actions);
  customization.effects = deserializePatchSequence(customization.effects);
});

const CUSTOMIZATIONS_BY_ID = CUSTOMIZATIONS.reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, {});

class Customizations {
  static getAll() {
    return parsed.all();
  }

  static getById(id) {
    return parsed.one(CUSTOMIZATIONS_BY_ID[id]);
  }
}

export default Customizations;
