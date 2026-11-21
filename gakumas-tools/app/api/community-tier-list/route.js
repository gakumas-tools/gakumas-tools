import { getServerSession } from "next-auth/next";
import { authOptions } from "@/utils/auth";
import { readJsonBody } from "@/utils/apiValidation";
import {
  communityTierList,
  getPublishedTierList,
  isTierListType,
  publishTierList,
  unpublishTierList,
} from "@/utils/communityTierLists";
import { ENTITY_DATA_BY_TYPE, isEntityHidden } from "@/utils/entities";
import { connect } from "@/utils/mongodb";

const MAX_BODY_BYTES = 25_000;

// ?type=<type>: the community view for that type, for anyone.
// ?type=<type>&mine=1: the list you published for it, or null.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (!isTierListType(type)) {
    return new Response("Invalid type", { status: 400 });
  }

  if (params.get("mine") !== null) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });
    const { db } = await connect();
    const list = await getPublishedTierList(db, session.user.id, type);
    return Response.json({ list });
  }

  const { db } = await connect();
  const view = await communityTierList(db, type);
  return Response.json(view, {
    headers: { "cache-control": "public, max-age=300" },
  });
}

// Publish your list for a type, replacing the last: { type, list } with
// list in the tier list's link form. Only ids the site shows count.
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });

  const data = ENTITY_DATA_BY_TYPE[body.type];
  const isKnownId = (id) =>
    !!data?.getById(id) && !isEntityHidden(body.type, id);
  const { db } = await connect();
  const result = await publishTierList(
    db,
    session.user.id,
    body.type,
    body.list,
    isKnownId,
  );
  if (result.error) {
    return new Response(result.error, { status: result.status });
  }
  return Response.json({ list: result.list });
}

// Take your list for a type out: { type }.
export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { body, error, status } = await readJsonBody(request, 1_000);
  if (error) return new Response(error, { status });

  const { db } = await connect();
  if (!(await unpublishTierList(db, session.user.id, body.type))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, { status: 204 });
}
