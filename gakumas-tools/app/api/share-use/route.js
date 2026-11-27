import { readJsonBody } from "@/utils/apiValidation";
import { clientIp } from "@/utils/clientIp";
import { connect } from "@/utils/mongodb";
import { pseudonym } from "@/utils/pseudonym";
import {
  SHARE_OPENS,
  isCrawler,
  shareUseKey,
  shareUseWrites,
} from "@/utils/shareOpens";

const MAX_BODY_BYTES = 20_000;
const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;
const recent = (global.shareUseCounts ??= new Map());

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
 * A visitor who opened a shared link acted on it: POST { kind, query }, query
 * being the shared page's search string at page load. Counts a reuse on the
 * link's shareOpens document if it has one. Counts and pseudonyms only.
 */
export async function POST(request) {
  if (isCrawler(request.headers.get("user-agent"))) return done();
  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (read.error) return new Response(read.error, { status: read.status });
  const key = shareUseKey(read.body);
  if (!key) return done();

  const ipHash = pseudonym(`ip:${clientIp(request.headers)}`);
  if (limited(ipHash)) return new Response("Too many reports", { status: 429 });
  const writes = shareUseWrites({
    key,
    ipHash,
    now: new Date(),
    // A shared run's opens already skip its owner, so its first opener is
    // someone else; the page skips the owner's reuse too.
    skipFirstOpener: read.body.kind != "sharedRun",
  });
  try {
    const { db } = await connect();
    await db.collection(SHARE_OPENS).bulkWrite(writes, { ordered: true });
  } catch (error) {
    console.warn("shareUse:", error.message);
  }
  return done();
}
