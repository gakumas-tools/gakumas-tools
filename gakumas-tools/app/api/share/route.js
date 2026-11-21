import { getServerSession } from "next-auth/next";
import { authOptions } from "@/utils/auth";
import { readJsonBody } from "@/utils/apiValidation";
import { connect } from "@/utils/mongodb";
import {
  isListableStageId,
  listSharedRuns,
  listStageRuns,
  setListed,
  shareLoadout,
  unshareRun,
} from "@/utils/sharedRuns";

const MAX_BODY_BYTES = 1_000;

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

// ?stage=<id>: the runs listed on that stage's page, for anyone.
// Otherwise your shared runs, so the saved-runs list can show which are
// shared and which are listed.
export async function GET(request) {
  const stageParam = new URL(request.url).searchParams.get("stage");
  if (stageParam !== null) {
    const stageId = /^\d{1,9}$/.test(stageParam) ? Number(stageParam) : NaN;
    if (!isListableStageId(stageId)) {
      return new Response("Invalid stage", { status: 400 });
    }
    const { db } = await connect();
    const runs = await listStageRuns(db, stageId);
    return Response.json(
      runs.map(({ id, name, stats, derived, createdAt }) => ({
        id,
        name,
        stats,
        derived,
        createdAt,
      })),
      { headers: { "cache-control": "public, max-age=60" } },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { db } = await connect();
  const runs = await listSharedRuns(db, session.user.id);
  return Response.json(
    runs.map(({ _id, sourceId, name, listed, createdAt }) => ({
      id: _id,
      loadoutId: sourceId,
      name,
      listed: !!listed,
      createdAt,
    })),
  );
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
  const result = await setListed(db, session.user.id, body.id, body.listed);
  if (result.error) return new Response(result.error, { status: result.status });
  return new Response(null, { status: 204 });
}
