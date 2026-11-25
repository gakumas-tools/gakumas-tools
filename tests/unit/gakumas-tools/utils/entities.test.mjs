import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDDEN_P_IDOL_IDS, PIdols } from "gakumas-data";
import {
  EntityTypes,
  isEntityHidden,
} from "../../../../gakumas-tools/utils/entities.js";

test("hidden P-idols are hidden, and only the April Fools idol's", () => {
  for (const id of HIDDEN_P_IDOL_IDS) {
    assert.ok(PIdols.getById(id), `${id} still has data`);
    assert.equal(PIdols.getById(id).idolId, 14, `${id}`);
    assert.equal(isEntityHidden(EntityTypes.P_IDOL, id), true, `${id}`);
  }
  assert.deepEqual([...HIDDEN_P_IDOL_IDS], [131, 132, 133]);
  assert.equal(isEntityHidden(EntityTypes.P_IDOL, 130), false);
});
