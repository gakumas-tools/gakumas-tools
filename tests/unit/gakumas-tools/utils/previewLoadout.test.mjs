import { test } from "node:test";
import assert from "node:assert/strict";
import { Stages } from "gakumas-data";
import {
  previewLoadoutFromSearchParams,
  searchParamsFromRecord,
} from "../../../../gakumas-tools/utils/previewLoadout.js";
import { loadoutsToSearchParams } from "../../../../gakumas-tools/utils/simulator.js";

const linkStage = Stages.getAll().find((s) => s.type == "linkContest");

const loadout = (cards) => ({
  stageId: linkStage.id,
  supportBonus: null,
  params: [1000, 1000, 1000, 50],
  pItemIds: [1, 0, 0, 0],
  skillCardIdGroups: [cards],
  customizationGroups: [cards.map(() => ({}))],
});

// What Next hands generateMetadata for a repeated query key.
function nextSearchParamsRecord(searchParams) {
  const record = {};
  for (const [key, value] of searchParams) {
    record[key] = key in record ? [].concat(record[key], value) : value;
  }
  return record;
}

test("a link contest share URL previews its first loadout", () => {
  const shared = loadoutsToSearchParams([
    loadout([1, 2, 3, 4, 5, 6]),
    loadout([7, 8, 9, 10, 11, 12]),
  ]);
  const query = searchParamsFromRecord(nextSearchParamsRecord(shared));
  assert.equal(query.getAll("loadout").length, 2);

  const preview = previewLoadoutFromSearchParams(
    new URL(`https://example.com/api/preview?${query}`).searchParams,
  );
  assert.equal(preview.stageId, linkStage.id);
  assert.deepEqual(preview.skillCardIdGroups, [[1, 2, 3, 4, 5, 6]]);
});

test("a regular share URL previews its own loadout", () => {
  const preview = previewLoadoutFromSearchParams(
    new URLSearchParams("stage=1&cards=1-2-3&items=1"),
  );
  assert.equal(preview.stageId, 1);
  assert.deepEqual(preview.skillCardIdGroups, [[1, 2, 3]]);
});
