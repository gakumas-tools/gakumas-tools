import { connect } from "@/utils/mongodb";
import { getSharedRun, isShareId } from "@/utils/sharedRuns";

// A shared run, for anyone with its link.
export async function GET(request, { params }) {
  const { id } = await params;
  if (!isShareId(id)) return new Response("Not found", { status: 404 });

  const { db } = await connect();
  const run = await getSharedRun(db, id);
  if (!run) return new Response("Not found", { status: 404 });
  return Response.json(run);
}
