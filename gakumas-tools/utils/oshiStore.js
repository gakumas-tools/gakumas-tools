import { connect } from "@/utils/mongodb";
import { DEFAULT_BANNER, DEFAULT_OSHI_SETTINGS } from "@/utils/oshi";

const DOC_ID = "oshi";
const CACHE_TTL_MS = 60 * 1000;
const FIRST_LOAD_TIMEOUT_MS = 2000;

// Shared through global so the API route's writes reach the layout's reads.
// `saves` counts saves, so a refresh whose read started before a save
// doesn't put the old settings back.
const cache = (global.oshiSettings ??= {
  entry: null,
  refreshing: null,
  saves: 0,
});

async function settingsCollection() {
  const { db } = await connect();
  return db.collection("settings");
}

function setCached(settings) {
  cache.entry = { settings, expiresAt: Date.now() + CACHE_TTL_MS };
}

export async function readOshiSettings() {
  const collection = await settingsCollection();
  const doc = await collection.findOne({ _id: DOC_ID });
  const banners = doc?.banners ?? DEFAULT_OSHI_SETTINGS.banners;
  return {
    banners: banners.map((banner) => ({ ...DEFAULT_BANNER, ...banner })),
  };
}

export async function saveOshiSettings(settings) {
  const collection = await settingsCollection();
  await collection.replaceOne(
    { _id: DOC_ID },
    { ...settings, updatedAt: new Date() },
    { upsert: true }
  );
  cache.saves = (cache.saves ?? 0) + 1;
  setCached(settings);
}

function refresh() {
  const saves = cache.saves;
  cache.refreshing ??= readOshiSettings()
    .catch((error) => {
      console.error("Failed to load oshi settings", error);
      return cache.entry?.settings ?? DEFAULT_OSHI_SETTINGS;
    })
    .then((settings) => {
      if (cache.saves === saves) setCached(settings);
    })
    .finally(() => (cache.refreshing = null));
  return cache.refreshing;
}

export async function getCachedOshiSettings() {
  if (!cache.entry) {
    await Promise.race([
      refresh(),
      new Promise((resolve) => setTimeout(resolve, FIRST_LOAD_TIMEOUT_MS)),
    ]);
  } else if (Date.now() > cache.entry.expiresAt) {
    refresh();
  }
  return cache.entry?.settings ?? DEFAULT_OSHI_SETTINGS;
}
