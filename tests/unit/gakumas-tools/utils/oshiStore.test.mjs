import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Serve @/utils/mongodb from an in-memory "settings" collection whose reads
// can be held open, to stand in for a slow database read.
const mongodbMock = new URL("./oshiStore.mongodb.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/utils/mongodb") {
      return { url: mongodbMock, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { store } = await import("./oshiStore.mongodb.mjs");
const { getCachedOshiSettings, saveOshiSettings } = await import(
  "../../../../gakumas-tools/utils/oshiStore.js"
);

const banner = (id) => ({
  id,
  enabled: true,
  text: { ja: id },
  colors: ["#123456"],
  action: "link",
  url: "https://example.com",
});
const bannerIds = (settings) => settings.banners.map((b) => b.id);

test("a refresh that read before a save doesn't overwrite the saved settings", async () => {
  store.doc = { _id: "oshi", banners: [banner("old")] };
  assert.deepEqual(bannerIds(await getCachedOshiSettings()), ["old"]);

  // The cache goes stale and a page render starts a refresh whose read is
  // slow; an admin saves new settings while it's in flight.
  global.oshiSettings.entry.expiresAt = 0;
  let release;
  store.gate = new Promise((resolve) => (release = resolve));
  getCachedOshiSettings();
  await saveOshiSettings({ banners: [banner("new")] });
  assert.deepEqual(bannerIds(await getCachedOshiSettings()), ["new"]);

  release();
  await global.oshiSettings.refreshing;
  store.gate = null;
  assert.deepEqual(bannerIds(await getCachedOshiSettings()), ["new"]);
});

test("a refresh after the save still updates the cache", async () => {
  store.doc = { _id: "oshi", banners: [banner("db")] };
  global.oshiSettings.entry.expiresAt = 0;
  getCachedOshiSettings();
  await global.oshiSettings.refreshing;
  assert.deepEqual(bannerIds(await getCachedOshiSettings()), ["db"]);
});
