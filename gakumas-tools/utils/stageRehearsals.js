import { stageGapSummary } from "./rehearsalComparison";
import { simulateRunStats } from "./runStats";
import { isListableStageId } from "./stageListing";

// The rehearsals players shared for a stage, summed up for its page: how many,
// and how far the simulator's mean is from the game's (stageGapSummary). Each
// comparison is simulated here, on the engine now running, and the result is
// kept as serverSim; the mean the player's browser sent is never used.

export const COMPARISONS = "rehearsalComparisons";
// The stage page counts the comparisons shared in this many days.
export const STAGE_GAP_DAYS = 28;
// At most this many of a stage's comparisons are read.
const STAGE_GAP_MAX = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

function stageFilter(stageId, now) {
  return {
    "loadout.stageId": stageId,
    updatedAt: { $gte: new Date(now.getTime() - STAGE_GAP_DAYS * DAY_MS) },
  };
}

function findStage(db, stageId, now) {
  return db
    .collection(COMPARISONS)
    .find(stageFilter(stageId, now), {
      projection: {
        loadout: 1,
        enterPercents: 1,
        rehearsal: 1,
        serverSim: 1,
        serverSimTried: 1,
        userHash: 1,
        ipHash: 1,
      },
    })
    .sort({ updatedAt: -1 })
    .limit(STAGE_GAP_MAX)
    .toArray();
}

// A local build has no version: what it simulated counts as current.
const tag = (version) => version || "local";
const isCurrent = (serverSim, version) =>
  !!serverSim && (!version || serverSim.version === version);

/**
 * The stage page's line: stageGapSummary over the comparisons shared for this
 * stage in the last STAGE_GAP_DAYS days that the server has simulated, or
 * null. A comparison simulated on an earlier deploy still counts until
 * refreshStageComparisons simulates it again.
 * Index: { "loadout.stageId": 1, updatedAt: -1 }.
 */
export async function stageRehearsalGap(db, stageId, { now = new Date() } = {}) {
  if (!isListableStageId(stageId)) return null;
  const docs = await findStage(db, stageId, now);
  return stageGapSummary(
    docs
      .filter((doc) => Number.isFinite(doc.serverSim?.mean))
      .map((doc) => ({ ...doc, simMean: doc.serverSim.mean })),
  );
}

/**
 * Simulates up to `max` of a stage's recent comparisons that have no
 * serverSim from this engine version. One the engine can't simulate isn't
 * tried again on this version. How many were tried.
 */
export async function refreshStageComparisons(
  db,
  stageId,
  version,
  { simulate = simulateRunStats, max = 1, now = new Date() } = {},
) {
  if (!isListableStageId(stageId)) return 0;
  const docs = await findStage(db, stageId, now);
  const stale = docs
    .filter(
      (doc) =>
        !isCurrent(doc.serverSim, version) &&
        doc.serverSimTried !== tag(version),
    )
    .slice(0, max);
  const comparisons = db.collection(COMPARISONS);
  for (const doc of stale) {
    const simulated = await simulate({
      ...doc.loadout,
      enterPercents: !!doc.enterPercents,
    });
    const mean = simulated?.stats?.mean;
    const $set = Number.isFinite(mean)
      ? {
          serverSim: {
            mean,
            numRuns: simulated.numRuns,
            ...(version && { version }),
          },
        }
      : { serverSimTried: tag(version) };
    await comparisons.updateOne({ _id: doc._id }, { $set });
  }
  return stale.length;
}
