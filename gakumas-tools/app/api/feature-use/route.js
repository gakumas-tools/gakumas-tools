import { readJsonBody } from "@/utils/apiValidation";
import { clientIp } from "@/utils/clientIp";
import { FEATURE_USE, featureUseWrite } from "@/utils/featureUse";
import { connect } from "@/utils/mongodb";
import { pseudonym } from "@/utils/pseudonym";
import { isCrawler } from "@/utils/shareOpens";

const MAX_BODY_BYTES = 1_000;
const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;
const recent = (global.featureUseCounts ??= new Map());

function limited(ipHash) {
  const now = Date.now();
  if (recent.size > MAX_TRACKED) recent.clear();
  const times = (recent.get(ipHash) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return true;
  times.push(now);
  recent.set(ipHash, times);
  return false;
}

const done = () => new Response(null, { status: 204 });

/**
 * A visitor took one step of a flow: POST { event }. Adds one to that step's
 * count for the week. Only weekly totals are stored: no ids, no pseudonyms.
 */
export async function POST(request) {
  if (isCrawler(request.headers.get("user-agent"))) return done();
  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (read.error) return new Response(read.error, { status: read.status });
  const write = featureUseWrite(read.body?.event, new Date());
  if (!write) return done();

  // The pseudonym only keys the in-memory rate limit; it is never stored.
  if (limited(pseudonym(`ip:${clientIp(request.headers)}`))) {
    return new Response("Too many reports", { status: 429 });
  }
  try {
    const { db } = await connect();
    await db
      .collection(FEATURE_USE)
      .updateOne(write.filter, write.update, { upsert: true });
  } catch (error) {
    console.warn("featureUse:", error.message);
  }
  return done();
}
