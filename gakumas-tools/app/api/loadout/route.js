import { getServerSession } from "next-auth/next";
import { ObjectId } from "mongodb";
import { authOptions } from "@/utils/auth";
import { connect } from "@/utils/mongodb";
import {
  MAX_LOADOUTS_PER_USER,
  isName,
  isObjectId,
  isObjectIdList,
  readJsonBody,
  validateLoadout,
} from "@/utils/apiValidation";
import { listLoadouts } from "@/utils/userLists";

const MAX_BODY_BYTES = 100_000;

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });
  const invalid = validateLoadout(body);
  if (invalid) return new Response(invalid, { status: 400 });
  const {
    name,
    stageId,
    enterPercents,
    customStage,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
    linkLoadouts,
    stats,
    derived,
  } = body;

  const { db } = await connect();
  const collection = db.collection("loadouts");
  if ((await collection.countDocuments({ userId })) >= MAX_LOADOUTS_PER_USER) {
    return new Response("Too many loadouts", { status: 409 });
  }
  const result = await collection.insertOne({
    name,
    stageId,
    enterPercents: !!enterPercents,
    customStage,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
    linkLoadouts: linkLoadouts || null,
    stats: stats || null,
    derived: derived || null,
    userId,
    createdAt: new Date(),
  });

  return Response.json({ id: result.insertedId });
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const { db } = await connect();
  return Response.json(await listLoadouts(db, userId));
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });
  const { id, name } = body;
  if (!isObjectId(id)) return new Response("Invalid id", { status: 400 });
  if (!isName(name)) return new Response("Invalid name", { status: 400 });

  const { db } = await connect();
  const { matchedCount } = await db
    .collection("loadouts")
    .updateOne({ _id: new ObjectId(id), userId }, { $set: { name } });
  if (!matchedCount) return new Response("Not found", { status: 404 });

  return new Response(null, { status: 204 });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });
  if (!isObjectIdList(body.ids)) {
    return new Response("Invalid ids", { status: 400 });
  }

  const { db } = await connect();
  await db.collection("loadouts").deleteMany({
    _id: { $in: body.ids.map((id) => new ObjectId(id)) },
    userId,
  });

  return new Response(null, { status: 204 });
}
