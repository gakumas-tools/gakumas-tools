import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { MAX_LOADOUTS_PER_USER, isObjectId } from "./apiValidation";
import { simulateRunStats } from "./runStats";
import { STAGE_RUNS_LIMIT, isListableStageId } from "./stageListing";

// A shared run is a public copy of one saved run (a loadout with its
// simulated stats), reachable by a short id at /s/<id>. It's a copy, so
// renaming or deleting the saved run leaves the shared one as it was, and
// only its owner can take it down.
//
// A shared run is unlisted (only its link finds it) until its owner lists it
// on its stage's page; listStageRuns shows the listed ones, best first.
// Listing simulates the run here and keeps those stats as serverStats; the
// stage page ranks and shows only those, so a forged stats field can't move
// a run up.

export const SHARED_RUNS = "sharedRuns";
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 8;
const SHARE_ID = new RegExp(`^[0-9A-Za-z]{${ID_LENGTH}}$`);
const ID_ATTEMPTS = 5;

// What a saved run holds that others may see: never its owner's id, only
// the name they shared it under (sharedBy, their Discord display name when
// they shared or listed it; null for runs shared before names were shown).
const PUBLIC_FIELDS = [
  "name",
  "sharedBy",
  "stageId",
  "enterPercents",
  "customStage",
  "supportBonus",
  "params",
  "pItemIds",
  "skillCardIdGroups",
  "customizationGroups",
  "linkLoadouts",
  "stats",
  "derived",
];

export function newShareId() {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[randomInt(ALPHABET.length)];
  }
  return id;
}

const MAX_SHARED_BY = 64;

/** The name a run is shown under: the sharer's display name, trimmed, or null. */
export function sharerName(name) {
  if (typeof name != "string") return null;
  const trimmed = name.trim().slice(0, MAX_SHARED_BY);
  return trimmed || null;
}

export function isShareId(value) {
  return typeof value == "string" && SHARE_ID.test(value);
}

function publicFields(doc) {
  const fields = {};
  for (const field of PUBLIC_FIELDS) fields[field] = doc[field] ?? null;
  return fields;
}

/**
 * Shares one of the user's saved runs: { id } of its public copy, made now
 * or the one already made for it, or { error, status }.
 */
export async function shareLoadout(
  db,
  userId,
  loadoutId,
  makeId = newShareId,
  sharedBy = null,
) {
  sharedBy = sharerName(sharedBy);
  if (!isObjectId(loadoutId)) return { error: "Invalid id", status: 400 };
  const sourceId = new ObjectId(loadoutId);
  const loadout = await db
    .collection("loadouts")
    .findOne({ _id: sourceId, userId });
  if (!loadout) return { error: "Not found", status: 404 };

  const shared = db.collection(SHARED_RUNS);
  const existing = await shared.findOne(
    { userId, sourceId },
    { projection: { _id: 1 } },
  );
  if (existing) {
    // The saved run may have been renamed since, and its owner's display
    // name changed; the rest can't change.
    await shared.updateOne(
      { _id: existing._id },
      { $set: { name: loadout.name ?? null, sharedBy } },
    );
    return { id: existing._id };
  }
  if ((await shared.countDocuments({ userId })) >= MAX_LOADOUTS_PER_USER) {
    return { error: "Too many shared runs", status: 409 };
  }

  for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
    const id = makeId();
    try {
      await shared.insertOne({
        _id: id,
        ...publicFields(loadout),
        sharedBy,
        userId,
        sourceId,
        listed: false,
        createdAt: new Date(),
      });
      return { id };
    } catch (error) {
      if (error?.code != 11000) throw error;
      // Taken by another share, or this same run shared twice at once.
      const raced = await shared.findOne(
        { userId, sourceId },
        { projection: { _id: 1 } },
      );
      if (raced) return { id: raced._id };
    }
  }
  return { error: "Could not make an id", status: 503 };
}

/**
 * A shared run as anyone may see it, or null. A run that has been listed
 * shows the stats the server simulated for it, as its stage's page does,
 * not the ones its owner's browser sent.
 */
export async function getSharedRun(db, id) {
  if (!isShareId(id)) return null;
  const doc = await db.collection(SHARED_RUNS).findOne({ _id: id });
  if (!doc) return null;
  const run = { id: doc._id, ...publicFields(doc), createdAt: doc.createdAt };
  if (doc.serverStats) run.stats = withoutVersion(doc.serverStats);
  return run;
}

/** Whether the user is the one who shared run `id`. */
export async function ownsSharedRun(db, id, userId) {
  if (!userId || !isShareId(id)) return false;
  const doc = await db
    .collection(SHARED_RUNS)
    .findOne({ _id: id, userId }, { projection: { _id: 1 } });
  return !!doc;
}

/** The user's shared runs, newest first: which saved run each copies. */
export function listSharedRuns(db, userId) {
  return db
    .collection(SHARED_RUNS)
    .find(
      { userId },
      { projection: { _id: 1, sourceId: 1, name: 1, listed: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(MAX_LOADOUTS_PER_USER)
    .toArray();
}

/** Takes a shared run down; only its owner can. Whether there was one. */
export async function unshareRun(db, userId, id) {
  if (!isShareId(id)) return false;
  const { deletedCount } = await db
    .collection(SHARED_RUNS)
    .deleteOne({ _id: id, userId });
  return deletedCount > 0;
}

/**
 * Lists or unlists one of the user's shared runs on its stage's page; only
 * its owner can. Listing simulates it first and stores the result as
 * serverStats, tagged with the engine version (the deployed commit) that
 * made it. { ok: true }, or { error, status }.
 */
export async function setListed(
  db,
  userId,
  id,
  listed,
  simulate = simulateRunStats,
  version = null,
  sharedBy = null,
) {
  if (!isShareId(id) || typeof listed != "boolean") {
    return { error: "Not found", status: 404 };
  }
  const shared = db.collection(SHARED_RUNS);
  if (!listed) {
    const { matchedCount } = await shared.updateOne(
      { _id: id, userId },
      { $set: { listed: false } },
    );
    return matchedCount > 0 ? { ok: true } : { error: "Not found", status: 404 };
  }

  const doc = await shared.findOne({ _id: id, userId });
  if (!doc) return { error: "Not found", status: 404 };
  if (!isListableStageId(doc.stageId)) {
    return { error: "Only game stages can be listed", status: 400 };
  }
  // A shared copy's loadout never changes, so one simulation per engine
  // version is enough.
  let { serverStats } = doc;
  if (!serverStats || !isCurrent(serverStats, version)) {
    const simulated = await simulate(doc);
    if (!simulated) return { error: "Could not simulate", status: 422 };
    serverStats = statsFrom(simulated, version);
  }
  const { matchedCount } = await shared.updateOne(
    { _id: id, userId },
    { $set: { listed: true, serverStats, sharedBy: sharerName(sharedBy) } },
  );
  return matchedCount > 0 ? { ok: true } : { error: "Not found", status: 404 };
}

export const STAGE_RUNS_MAX = 50;

// Stats are current if the engine that made them is the one running now.
// With no known version (a local build) any stats count as current.
function isCurrent(serverStats, version) {
  return !version || serverStats?.version === version;
}

function statsFrom(simulated, version) {
  const stats = { ...simulated.stats, numRuns: simulated.numRuns };
  if (version) stats.version = version;
  return stats;
}

/**
 * Re-simulates up to `max` of a stage's listed runs whose serverStats came
 * from another engine version, so a fix to the engine reaches the stage page
 * without anyone re-listing. A run the new engine can't simulate keeps its
 * old stats and isn't tried again on this version. How many were tried.
 */
export async function refreshStageRuns(
  db,
  stageId,
  version,
  { simulate = simulateRunStats, max = 1 } = {},
) {
  if (!version || !isListableStageId(stageId)) return 0;
  const shared = db.collection(SHARED_RUNS);
  const docs = await shared
    .find({ stageId, listed: true })
    .sort({ "serverStats.median": -1, createdAt: -1 })
    .limit(STAGE_RUNS_MAX)
    .toArray();
  const stale = docs
    .filter(
      (doc) =>
        !isCurrent(doc.serverStats, version) &&
        doc.serverStatsTried !== version,
    )
    .slice(0, max);
  for (const doc of stale) {
    const simulated = await simulate(doc);
    const $set = simulated
      ? { serverStats: statsFrom(simulated, version) }
      : { serverStatsTried: version };
    await shared.updateOne({ _id: doc._id, listed: true }, { $set });
  }
  return stale.length;
}

export { STAGE_RUNS_LIMIT };

export { isListableStageId };

function withoutVersion(serverStats) {
  if (!serverStats) return serverStats;
  const { version, ...stats } = serverStats;
  return stats;
}

/**
 * The runs listed on a stage's page, highest server-simulated median first, as
 * anyone may see them: never their owners. Their stats are serverStats, not
 * what the owner's browser sent.
 * Index: { stageId: 1, listed: 1, "serverStats.median": -1 }.
 */
export async function listStageRuns(db, stageId, limit = STAGE_RUNS_LIMIT) {
  if (!isListableStageId(stageId)) return [];
  const count = Math.min(Math.max(1, Math.floor(limit) || 1), STAGE_RUNS_MAX);
  const projection = { _id: 1, createdAt: 1, serverStats: 1 };
  for (const field of PUBLIC_FIELDS) projection[field] = 1;
  const docs = await db
    .collection(SHARED_RUNS)
    .find(
      { stageId, listed: true },
      { projection },
    )
    .sort({ "serverStats.median": -1, createdAt: -1 })
    .limit(count)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    ...publicFields(doc),
    stats: withoutVersion(doc.serverStats),
    createdAt: doc.createdAt,
  }));
}

// The /shared page: every listed run, one stage at a time or all of them.
// Only runs their owners listed are here; an unlisted share stays reachable
// by its link alone.

export const BROWSE_PAGE_SIZE = 20;
const BROWSE_STAGES_MAX = 200;

/** A stage id from a query string: a game stage's, or null. */
export function parseStageId(value) {
  if (typeof value != "string" || !/^[1-9]\d{0,8}$/.test(value)) return null;
  return Number(value);
}

/**
 * A paging cursor from a query string, "<createdAt ISO>~<share id>": where
 * the page before this one ended. Null if it isn't one.
 */
export function parseCursor(value) {
  if (typeof value != "string" || value.length > 60) return null;
  const [iso, id, ...rest] = value.split("~");
  if (rest.length || !isShareId(id)) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

export function formatCursor(run) {
  return `${new Date(run.createdAt).toISOString()}~${run.id}`;
}

/**
 * Listed runs, newest first, for one stage or all of them, as anyone may see
 * them: never their owners, and with the server's stats, not the owner's.
 * { runs, next }: next is the cursor for the page after this one, or null.
 * Indexes: { listed: 1, createdAt: -1, _id: -1 } and
 * { listed: 1, stageId: 1, createdAt: -1, _id: -1 }.
 */
export async function browseListedRuns(
  db,
  { stageId = null, after = null } = {},
) {
  const filter = { listed: true };
  if (stageId != null) {
    if (!isListableStageId(stageId)) return { runs: [], next: null };
    filter.stageId = stageId;
  }
  if (after) {
    filter.$or = [
      { createdAt: { $lt: after.createdAt } },
      { createdAt: after.createdAt, _id: { $lt: after.id } },
    ];
  }
  const projection = { _id: 1, createdAt: 1, serverStats: 1 };
  for (const field of PUBLIC_FIELDS) projection[field] = 1;
  const docs = await db
    .collection(SHARED_RUNS)
    .find(filter, { projection })
    .sort({ createdAt: -1, _id: -1 })
    .limit(BROWSE_PAGE_SIZE + 1)
    .toArray();
  const runs = docs.slice(0, BROWSE_PAGE_SIZE).map((doc) => ({
    id: doc._id,
    ...publicFields(doc),
    stats: withoutVersion(doc.serverStats) ?? null,
    createdAt: doc.createdAt ?? null,
  }));
  const more = docs.length > BROWSE_PAGE_SIZE;
  return { runs, next: more ? formatCursor(runs.at(-1)) : null };
}

/**
 * The game stages that have listed runs: [{ stageId, count }], the stage with
 * the latest listed run first. Custom stages have no listing, so they're not
 * here.
 */
export async function listedRunStages(db) {
  const groups = await db
    .collection(SHARED_RUNS)
    .aggregate([
      { $match: { listed: true, stageId: { $type: "number", $gt: 0 } } },
      {
        $group: {
          _id: "$stageId",
          count: { $sum: 1 },
          latest: { $max: "$createdAt" },
        },
      },
      { $sort: { latest: -1, _id: -1 } },
      { $limit: BROWSE_STAGES_MAX },
    ])
    .toArray();
  return groups
    .filter(({ _id }) => isListableStageId(_id))
    .map(({ _id, count }) => ({ stageId: _id, count }));
}
