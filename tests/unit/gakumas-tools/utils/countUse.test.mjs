import { test } from "node:test";
import assert from "node:assert/strict";
import { countMonthly } from "../../../../gakumas-tools/utils/countUse.js";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test("a browser counts once a month, and again the next month", () => {
  const sent = [];
  globalThis.fetch = async (url, init) => sent.push(JSON.parse(init.body).event);
  const store = memoryStorage();
  assert.equal(countMonthly("simulatorUser", new Date("2026-11-03T00:00:00Z"), store), true);
  assert.equal(countMonthly("simulatorUser", new Date("2026-11-29T00:00:00Z"), store), false);
  assert.equal(store.getItem("countedMonth:simulatorUser"), "2026-11");
  assert.equal(countMonthly("simulatorUser", new Date("2026-12-01T00:00:00Z"), store), true);
  assert.equal(store.getItem("countedMonth:simulatorUser"), "2026-12");
  assert.deepEqual(sent, ["simulatorUser", "simulatorUser"]);
});

test("without storage it doesn't count, so the count never runs high", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() {} };
  assert.equal(countMonthly("simulatorUser", new Date(), broken), false);
});
