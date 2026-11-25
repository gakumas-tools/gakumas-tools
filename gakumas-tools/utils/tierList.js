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

// Known ranks only, each once, and each id in one tier: the editor keys rows
// by rank and items by id.
export function decodeList(str) {
  if (!str) return null;
  const tiers = [];
  const items = {};
  const seen = new Set();
  for (const seg of str.split("_")) {
    const eq = seg.indexOf("=");
    const rank = eq >= 0 ? seg.slice(0, eq) : seg;
    const idsStr = eq >= 0 ? seg.slice(eq + 1) : "";
    if (!AVAILABLE_RANKS.includes(rank)) continue;
    if (!items[rank]) {
      tiers.push(rank);
      items[rank] = [];
    }
    if (!idsStr) continue;
    for (const id of idsStr.split(".").map(Number)) {
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      items[rank].push(id);
    }
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

// Compares two lists by rank. Each id's rank in each list (null if absent),
// and for ids in both, delta = how many tiers higher `theirs` puts it than
// `mine`, counting only the tiers either list has (in the canonical order,
// so lists with different tiers still compare, and S4 to SSS is one step even
// though SSS+ sits between them in the rank icons). agreement = share of common ids given the same rank (null when
// none are common).
export function compareLists(mine, theirs) {
  const rankOf = (list) => {
    const m = new Map();
    for (const rank of list?.tiers || []) {
      for (const id of list.items?.[rank] || []) {
        if (!m.has(id)) m.set(id, rank);
      }
    }
    return m;
  };
  const a = rankOf(mine);
  const b = rankOf(theirs);
  const order = sortRanks([
    ...new Set([...(mine?.tiers || []), ...(theirs?.tiers || [])]),
  ]);
  const index = (rank) => order.indexOf(rank);
  const byId = {};
  const onlyMine = [];
  const onlyTheirs = [];
  let common = 0;
  let same = 0;
  for (const [id, rank] of a) {
    const other = b.has(id) ? b.get(id) : null;
    const delta = other === null ? null : index(rank) - index(other);
    byId[id] = { mine: rank, theirs: other, delta };
    if (other === null) {
      onlyMine.push(id);
    } else {
      common++;
      if (delta === 0) same++;
    }
  }
  for (const [id, rank] of b) {
    if (a.has(id)) continue;
    byId[id] = { mine: null, theirs: rank, delta: null };
    onlyTheirs.push(id);
  }
  return {
    byId,
    onlyMine,
    onlyTheirs,
    common,
    agreement: common ? same / common : null,
  };
}

// Combines many players' lists into one community view. For each id that at
// least `minLists` lists rank: n (how many lists rank it), median (the middle
// rank by the canonical order, the higher of the two middles when n is even),
// low and high (the middle half: the same count, a quarter of n rounded down,
// is left off each end, so with 4 or more lists one outlier on either side
// doesn't widen the spread), and counts per rank. `list` puts each id in its
// median's tier, ids in a tier ordered by how many lists rank them, then by
// id. Lists that can't be read are skipped and counted in `skipped`.
export function aggregateLists(lists, { minLists = 1 } = {}) {
  const index = (rank) => AVAILABLE_RANKS.indexOf(rank);
  const ranksById = new Map();
  let used = 0;
  let skipped = 0;
  for (const list of lists || []) {
    if (!list?.tiers || !list?.items) {
      skipped++;
      continue;
    }
    used++;
    const seen = new Set();
    for (const rank of list.tiers) {
      if (index(rank) < 0) continue;
      for (const id of list.items[rank] || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (!ranksById.has(id)) ranksById.set(id, []);
        ranksById.get(id).push(index(rank));
      }
    }
  }
  const byId = {};
  const items = {};
  for (const [id, indices] of ranksById) {
    if (indices.length < minLists) continue;
    const sorted = [...indices].sort((a, b) => a - b);
    const at = (q) => sorted[Math.floor(q * (sorted.length - 1))];
    const trim = Math.floor(sorted.length / 4);
    const counts = {};
    for (const i of sorted) {
      counts[AVAILABLE_RANKS[i]] = (counts[AVAILABLE_RANKS[i]] || 0) + 1;
    }
    const median = AVAILABLE_RANKS[at(0.5)];
    byId[id] = {
      n: sorted.length,
      median,
      low: AVAILABLE_RANKS[sorted[trim]],
      high: AVAILABLE_RANKS[sorted[sorted.length - 1 - trim]],
      counts,
    };
    (items[median] ||= []).push(id);
  }
  const tiers = sortRanks(Object.keys(items));
  for (const rank of tiers) {
    items[rank].sort((a, b) => byId[b].n - byId[a].n || a - b);
  }
  return { lists: used, skipped, byId, list: { tiers, items } };
}
