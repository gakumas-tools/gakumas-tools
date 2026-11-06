import { test } from "node:test";
import assert from "node:assert/strict";
import { loadoutFromQuery, runQuery } from "../../lib.mjs";

const QUERY = "stage=1&params=100-200-300-50&cards=1&items=0";

test("regression queries read percentage input, raw stats by default", () => {
  assert.equal(loadoutFromQuery(QUERY).enterPercents, false);
  assert.equal(loadoutFromQuery(QUERY + "&enter_percents=1").enterPercents, true);
});

test("regression replay scores percentage input as percentages", async () => {
  const raw = await runQuery(QUERY);
  const percents = await runQuery(QUERY + "&enter_percents=1");
  assert.ok(percents < raw);
});
