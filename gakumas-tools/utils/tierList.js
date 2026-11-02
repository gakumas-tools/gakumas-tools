import { AVAILABLE_RANKS, sortRanks } from "@/components/TierList/ranks";

export const DEFAULT_RANKS = ["S4", "SSS", "SS", "S", "A", "B"];

export const EMPTY_LIST = {
  tiers: DEFAULT_RANKS,
  items: DEFAULT_RANKS.reduce((acc, k) => {
    acc[k] = [];
    return acc;
  }, {}),
};

export function encodeList(list) {
  return list.tiers
    .map((rank) => `${rank}=${(list.items[rank] || []).join(".")}`)
    .join("_");
}

export function decodeList(str) {
  if (!str) return null;
  const tiers = [];
  const items = {};
  for (const seg of str.split("_")) {
    const eq = seg.indexOf("=");
    const rank = eq >= 0 ? seg.slice(0, eq) : seg;
    const idsStr = eq >= 0 ? seg.slice(eq + 1) : "";
    if (!rank) continue;
    tiers.push(rank);
    items[rank] = idsStr
      ? idsStr.split(".").map(Number).filter(Number.isFinite)
      : [];
  }
  if (!tiers.length) return null;
  return { tiers: sortRanks(tiers), items };
}

// Known ranks only, each id once, and at most `maxPerTier` ids per tier, plus
// the count cut from each tier.
export function clampList(list, maxPerTier) {
  const tiers = [...new Set(list.tiers)].filter((rank) =>
    AVAILABLE_RANKS.includes(rank),
  );
  const items = {};
  const overflow = {};
  const seen = new Set();
  for (const rank of tiers) {
    const unique = [];
    for (const id of list.items[rank] || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    items[rank] = unique.slice(0, maxPerTier);
    overflow[rank] = unique.length - items[rank].length;
  }
  return { tiers, items, overflow };
}

export function isDefaultList(list) {
  if (list.tiers.length !== DEFAULT_RANKS.length) return false;
  for (let i = 0; i < DEFAULT_RANKS.length; i++) {
    if (list.tiers[i] !== DEFAULT_RANKS[i]) return false;
  }
  return Object.values(list.items).every((arr) => arr.length === 0);
}
