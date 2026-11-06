import { createHash } from "node:crypto";
import { getServerSession } from "next-auth/next";
import { readJsonBody } from "@/utils/apiValidation";
import { authOptions } from "@/utils/auth";
import { clientIp } from "@/utils/clientIp";
import { connect } from "@/utils/mongodb";
import { validateComparison } from "@/utils/rehearsalComparison";

const MAX_BODY_BYTES = 100_000;
const COLLECTION = "rehearsalComparisons";
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;

const recentWrites = (global.rehearsalComparisonWrites ??= new Map());

function pseudonym(value) {
  return createHash("sha256")
    .update(`${process.env.NEXTAUTH_SECRET || ""}:${value}`)
    .digest("hex")
    .slice(0, 16);
}

function rateLimited(key) {
  const now = Date.now();
  if (recentWrites.size > MAX_TRACKED_CLIENTS) recentWrites.clear();
  const times = (recentWrites.get(key) || []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  const limited = times.length >= RATE_LIMIT;
  if (!limited) times.push(now);
  recentWrites.set(key, times);
  return limited;
}

export async function PUT(request) {
  const ipHash = pseudonym(`ip:${clientIp(request.headers)}`);
  if (rateLimited(`put:${ipHash}`)) {
    return new Response("Too many comparisons", { status: 429 });
  }

  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (read.error) return new Response(read.error, { status: read.status });
  const { comparison, error } = validateComparison(read.body);
  if (error) return new Response(error, { status: 400 });

  const session = await getServerSession(authOptions);
  const { _id, ...fields } = comparison;
  const now = new Date();
  const { db } = await connect();
  await db.collection(COLLECTION).updateOne(
    { _id },
    {
      $set: {
        ...fields,
        ipHash,
        userHash: session ? pseudonym(`user:${session.user.id}`) : null,
        commit: process.env.RENDER_GIT_COMMIT || null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return new Response(null, { status: 204 });
}

export async function DELETE(request) {
  const ipHash = pseudonym(`ip:${clientIp(request.headers)}`);
  if (rateLimited(`delete:${ipHash}`)) {
    return new Response("Too many deletions", { status: 429 });
  }

  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });
  const { id } = body;
  if (typeof id != "string") return new Response("Missing id", { status: 400 });

  const { db } = await connect();
  await db.collection(COLLECTION).deleteOne({ _id: id });
  return new Response(null, { status: 204 });
}
