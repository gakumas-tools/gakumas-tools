import { getServerSession } from "next-auth/next";
import { authOptions } from "@/utils/auth";
import { readJsonBody } from "@/utils/apiValidation";
import { connect } from "@/utils/mongodb";
import { withOpeners } from "@/utils/shareOpens";
import {
  isListableStageId,
  listSharedRuns,
  listStageRuns,
  refreshStageRuns,
  setListed,
  shareLoadout,
  unshareRun,
} from "@/utils/sharedRuns";

const MAX_BODY_BYTES = 1_000;

// The deployed commit stands for the engine version: listed runs simulated
// on an older one are simulated again, so an engine fix reaches the stage
// page. A local build has none, and keeps what it stored.
const ENGINE_VERSION = process.env.RENDER_GIT_COMMIT || null;

// One stale run per stage page view, in the background, one at a time.
let refreshing = null;
function refreshInBackground(db, stageId) {
  if (!ENGINE_VERSION || refreshing) return;
  refreshing = refreshStageRuns(db, stageId, ENGINE_VERSION)
    .catch((err) => console.error("refreshStageRuns", err))
    .finally(() => (refreshing = null));
}

// Share one of your saved runs: { loadoutId } -> { id }, its link /s/<id>.
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });

  const { db } = await connect();
  const result = await shareLoadout(db, session.user.id, body.loadoutId);
  if (result.error) {
    return new Response(result.error, { status: result.status });
  }
  return Response.json({ id: result.id });
}

// ?stage=<id>: the runs listed on that stage's page, for anyone. With
// &pIdol=<id>, only that P-idol's (an Idol Road stage is ranked per P-idol).
// Otherwise your shared runs, so the saved-runs list can show which are
// shared and which are listed.
export async function GET(request) {
  const stageParam = new URL(request.url).searchParams.get("stage");
  if (stageParam !== null) {
    const stageId = /^\d{1,9}$/.test(stageParam) ? Number(stageParam) : NaN;
    if (!isListableStageId(stageId)) {
      return new Response("Invalid stage", { status: 400 });
    }
    const pIdolParam = new URL(request.url).searchParams.get("pIdol");
    let pIdolId = null;
    if (pIdolParam !== null) {
      pIdolId = /^\d{1,9}$/.test(pIdolParam) ? Number(pIdolParam) : NaN;
      if (!(pIdolId > 0)) {
        return new Response("Invalid P-idol", { status: 400 });
      }
    }
    const { db } = await connect();
    const runs = await withOpeners(
      db,
      await listStageRuns(db, stageId, undefined, pIdolId),
    );
    refreshInBackground(db, stageId);
    return Response.json(
      runs.map(({ id, name, stats, derived, createdAt, openedBy, openedByMore }) => ({
        id,
        name,
        stats,
        derived,
        createdAt,
        openedBy,
        openedByMore,
      })),
      // Not cached: a player who lists or hides a run sees it at once.
      { headers: { "cache-control": "no-store" } },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { db } = await connect();
  const runs = await withOpeners(
    db,
    (await listSharedRuns(db, session.user.id)).map(
      ({ _id, sourceId, name, listed, createdAt }) => ({
        id: _id,
        loadoutId: sourceId,
        name,
        listed: !!listed,
        createdAt,
      }),
    ),
  );
  return Response.json(runs);
}

// Take one of your shared runs down: { id }.
export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });

  const { db } = await connect();
  if (!(await unshareRun(db, session.user.id, body.id))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, { status: 204 });
}

// List or unlist one of your shared runs on its stage's page:
// { id, listed }. A listed run shows the stats the server simulated.
export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });

  const { db } = await connect();
  // Listing simulates the run first (a few seconds at most).
  const result = await setListed(
    db,
    session.user.id,
    body.id,
    body.listed,
    undefined,
    ENGINE_VERSION,
  );
  if (result.error) return new Response(result.error, { status: result.status });
  return new Response(null, { status: 204 });
}
