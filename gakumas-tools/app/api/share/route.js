import { getServerSession } from "next-auth/next";
import { authOptions } from "@/utils/auth";
import { readJsonBody } from "@/utils/apiValidation";
import { connect } from "@/utils/mongodb";
import {
  listSharedRuns,
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

// Your shared runs, so the saved-runs list can show which are shared.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { db } = await connect();
  const runs = await listSharedRuns(db, session.user.id);
  return Response.json(
    runs.map(({ _id, sourceId, name, createdAt }) => ({
      id: _id,
      loadoutId: sourceId,
      name,
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
