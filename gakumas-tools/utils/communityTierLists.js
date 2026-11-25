import { aggregateLists, decodeList, encodeList } from "./tierList";

// A player may put one tier list per type into the community view, and only
// by choosing to: nothing a player makes in the tier list editor is kept
// until they publish it. Publishing again replaces their list; unpublishing
// takes it out. The community view combines the published lists with
// aggregateLists and never shows whose list is whose.

export const COMMUNITY_TIER_LISTS = "communityTierLists";
export const TIER_LIST_TYPES = ["SKILL_CARD", "P_ITEM", "P_DRINK", "P_IDOL"];

// Fewer lists than this and the view would show one or two players' own
// lists, so it shows only how many there are.
export const COMMUNITY_MIN_LISTS = 3;
// The newest lists counted for a view.
export const COMMUNITY_MAX_LISTS = 2000;

const MAX_ENCODED_LENGTH = 20_000;
const MAX_IDS = 2000;

export function isTierListType(value) {
  return TIER_LIST_TYPES.includes(value);
}

/**
 * The list as it would be kept: known ranks, each id once, ids that are
 * positive integers (and known, if `isKnownId` is given), empty tiers
 * dropped. Its encoded form, or null when it can't be read or ranks nothing.
 */
export function normalizeTierList(encoded, isKnownId = () => true) {
  if (typeof encoded != "string" || encoded.length > MAX_ENCODED_LENGTH) {
    return null;
  }
  const list = decodeList(encoded);
  if (!list) return null;
  const tiers = [];
  const items = {};
  let count = 0;
  for (const rank of list.tiers) {
    const ids = (list.items[rank] || []).filter(
      (id) => Number.isInteger(id) && id > 0 && isKnownId(id),
    );
    if (!ids.length) continue;
    tiers.push(rank);
    items[rank] = ids;
    count += ids.length;
  }
  if (!count || count > MAX_IDS) return null;
  return encodeList({ tiers, items });
}

/**
 * Publishes the user's list for a type, replacing the one they published
 * before: { list } as kept, or { error, status }.
 */
export async function publishTierList(db, userId, type, encoded, isKnownId) {
  if (!userId) return { error: "Unauthorized", status: 401 };
  if (!isTierListType(type)) return { error: "Invalid type", status: 400 };
  const list = normalizeTierList(encoded, isKnownId);
  if (!list) return { error: "Invalid list", status: 400 };
  await db
    .collection(COMMUNITY_TIER_LISTS)
    .updateOne(
      { userId, type },
      { $set: { list, updatedAt: new Date() } },
      { upsert: true },
    );
  return { list };
}

/** Takes the user's list for a type out. Whether there was one. */
export async function unpublishTierList(db, userId, type) {
  if (!userId || !isTierListType(type)) return false;
  const { deletedCount } = await db
    .collection(COMMUNITY_TIER_LISTS)
    .deleteOne({ userId, type });
  return deletedCount > 0;
}

/** The list the user published for a type (encoded), or null. */
export async function getPublishedTierList(db, userId, type) {
  if (!userId || !isTierListType(type)) return null;
  const doc = await db
    .collection(COMMUNITY_TIER_LISTS)
    .findOne({ userId, type });
  return doc?.list ?? null;
}

// An id ranked by only a few of many lists would land in whatever tier those
// few gave it; past 10 lists, an id needs a tenth of them.
export function minListsFor(count) {
  return count < 10 ? 1 : Math.ceil(count / 10);
}

/**
 * The community view for a type, as anyone may see it: { lists, list,
 * byId, minLists }. With fewer than COMMUNITY_MIN_LISTS lists, list and
 * byId are null. Index: { type: 1, updatedAt: -1 }.
 */
export async function communityTierList(db, type) {
  if (!isTierListType(type)) return null;
  const docs = await db
    .collection(COMMUNITY_TIER_LISTS)
    .find({ type }, { projection: { _id: 0, list: 1 } })
    .sort({ updatedAt: -1 })
    .limit(COMMUNITY_MAX_LISTS)
    .toArray();
  const lists = docs.map((doc) => decodeList(doc.list)).filter(Boolean);
  if (lists.length < COMMUNITY_MIN_LISTS) {
    return { lists: lists.length, list: null, byId: null, minLists: null };
  }
  const minLists = minListsFor(lists.length);
  const result = aggregateLists(lists, { minLists });
  return { lists: result.lists, list: result.list, byId: result.byId, minLists };
}
