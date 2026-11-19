import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { MAX_LOADOUTS_PER_USER, isObjectId } from "./apiValidation";

// A shared run is a public copy of one saved run (a loadout with its
// simulated stats), reachable by a short id at /s/<id>. It's a copy, so
// renaming or deleting the saved run leaves the shared one as it was, and
// only its owner can take it down.

export const SHARED_RUNS = "sharedRuns";
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 8;
const SHARE_ID = new RegExp(`^[0-9A-Za-z]{${ID_LENGTH}}$`);
const ID_ATTEMPTS = 5;

// What a saved run holds that others may see: never its owner.
const PUBLIC_FIELDS = [
  "name",
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
export async function shareLoadout(db, userId, loadoutId, makeId = newShareId) {
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
    // The saved run may have been renamed since; the rest can't change.
    await shared.updateOne(
      { _id: existing._id },
      { $set: { name: loadout.name ?? null } },
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
        userId,
        sourceId,
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

/** A shared run as anyone may see it, or null. */
export async function getSharedRun(db, id) {
  if (!isShareId(id)) return null;
  const doc = await db.collection(SHARED_RUNS).findOne({ _id: id });
  if (!doc) return null;
  return { id: doc._id, ...publicFields(doc), createdAt: doc.createdAt };
}

/** The user's shared runs, newest first: which saved run each copies. */
export function listSharedRuns(db, userId) {
  return db
    .collection(SHARED_RUNS)
    .find(
      { userId },
      { projection: { _id: 1, sourceId: 1, name: 1, createdAt: 1 } },
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
