import { headers } from "next/headers";
import { clientIp } from "@/utils/clientIp";
import { connect } from "@/utils/mongodb";
import { pseudonym } from "@/utils/pseudonym";
import {
  SHARE_OPENS,
  isCrawler,
  shareKey,
  shareOpenWrites,
} from "@/utils/shareOpens";

const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;
const recent = (global.shareOpenCounts ??= new Map());

function limited(ipHash) {
  const now = Date.now();
  if (recent.size > MAX_TRACKED) recent.clear();
  const times = (recent.get(ipHash) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return true;
  times.push(now);
  recent.set(ipHash, times);
  return false;
}

/**
 * Counts an open of a shared link to `kind`'s page. Never throws and never
 * holds the page up: the write goes out without being awaited.
 */
export async function recordShareOpen(kind, searchParams) {
  try {
    const key = shareKey(kind, searchParams);
    if (!key) return;
    const requestHeaders = await headers();
    const ipHash = pseudonym(`ip:${clientIp(requestHeaders)}`);
    if (limited(ipHash)) return;
    const writes = shareOpenWrites({
      key,
      kind,
      ipHash,
      crawler: isCrawler(requestHeaders.get("user-agent")),
      now: new Date(),
    });
    connect()
      .then(({ db }) => db.collection(SHARE_OPENS).bulkWrite(writes, { ordered: true }))
      .catch((error) => console.warn("shareOpens:", error.message));
  } catch (error) {
    console.warn("shareOpens:", error.message);
  }
}
