import { createHash } from "node:crypto";

// What makes a link a shared one, per page: the params that carry what the
// player made. Other params (tracking, display) don't change what's shared.
const CONTENT_PARAMS = {
  simulator: [
    "stage",
    "enter_percents",
    "support_bonus",
    "params",
    "items",
    "cards",
    "customizations",
    "loadout",
  ],
  tierList: ["type", "d"],
  // /s/<id>: a saved run shared as a public copy behind a short id.
  sharedRun: ["id"],
};
// At least one of these must be there for the link to carry anything shared.
const REQUIRED_PARAMS = {
  simulator: ["cards", "loadout"],
  tierList: ["d"],
  sharedRun: ["id"],
};

export const MAX_IP_HASHES = 20;

// Link-preview fetchers: they open a link to draw its card, not to look at it.
const CRAWLER =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|line-poker|embedly|slackbot|discordbot|twitterbot|telegrambot|whatsapp|skypeuripreview|bingpreview|google-?inspectiontool|headlesschrome|curl\/|wget\/|python-requests|node-fetch|go-http-client/i;

export function isCrawler(userAgent) {
  return !userAgent || CRAWLER.test(userAgent);
}

/**
 * The key a shared link is counted under, or null if the URL carries nothing
 * shared. The same content opened in another language, with other params or
 * in another order gets the same key.
 */
export function shareKey(kind, searchParams) {
  const keys = CONTENT_PARAMS[kind];
  if (!keys || !REQUIRED_PARAMS[kind].some((key) => searchParams.get(key))) return null;
  const kept = keys
    .flatMap((key) => searchParams.getAll(key).map((value) => [key, value]))
    .filter(([, value]) => value !== "");
  const canonical = new URLSearchParams(kept).toString();
  return createHash("sha256").update(`${kind}?${canonical}`).digest("hex").slice(0, 24);
}

/**
 * The writes that count one open of `key`: the counters, with the document
 * made on first sight, and the opener's pseudonym added while fewer than
 * MAX_IP_HASHES are kept. Crawlers count as unfurls and add no opener.
 */
export function shareOpenWrites({ key, kind, ipHash, crawler, now }) {
  const writes = [
    {
      updateOne: {
        filter: { _id: key },
        update: {
          $setOnInsert: { kind, firstAt: now },
          $set: { lastAt: now },
          $inc: crawler ? { unfurls: 1 } : { opens: 1 },
        },
        upsert: true,
      },
    },
  ];
  if (!crawler) {
    writes.push({
      updateOne: {
        filter: { _id: key, [`ipHashes.${MAX_IP_HASHES - 1}`]: { $exists: false } },
        update: { $addToSet: { ipHashes: ipHash } },
      },
    });
  }
  return writes;
}

export const SHARE_OPENS = "shareOpens";

/** The key a shared run's /s/<id> link is counted under. */
export function sharedRunKey(id) {
  return shareKey("sharedRun", new URLSearchParams({ id }));
}

/**
 * The runs, each with openedBy: how many people (by pseudonym, not crawlers)
 * have opened its /s/<id> link. Only MAX_IP_HASHES are kept, so at that many
 * openedByMore is true: it's at least that. The owner's own opens aren't
 * counted (the page skips them), so it's how many others used it. If the
 * counts can't be read, the runs come back as they were.
 */
export async function withOpeners(db, runs) {
  if (!runs.length) return runs;
  const keys = runs.map((run) => sharedRunKey(run.id));
  let docs;
  try {
    docs = await db
      .collection(SHARE_OPENS)
      .find({ _id: { $in: keys } }, { projection: { ipHashes: 1 } })
      .toArray();
  } catch (error) {
    console.warn("shareOpens:", error.message);
    return runs;
  }
  const counts = new Map(
    docs.map((doc) => [doc._id, Math.min(doc.ipHashes?.length ?? 0, MAX_IP_HASHES)]),
  );
  return runs.map((run, i) => {
    const openedBy = counts.get(keys[i]) ?? 0;
    return { ...run, openedBy, openedByMore: openedBy >= MAX_IP_HASHES };
  });
}

// Longest shared-page query a reuse report may carry (simulator links with
// three phases run to a few KB).
export const MAX_SHARE_QUERY_LENGTH = 16_000;

/**
 * The key a reuse report from the browser is counted under: { kind, query },
 * query being the shared page's search string as it was at page load. Null
 * if the report isn't one of ours or the link carries nothing shared.
 */
export function shareUseKey(body) {
  const { kind, query } = body ?? {};
  if (typeof kind != "string" || !Object.hasOwn(CONTENT_PARAMS, kind)) return null;
  if (typeof query != "string" || query.length > MAX_SHARE_QUERY_LENGTH) return null;
  return shareKey(kind, new URLSearchParams(query));
}

/**
 * The writes that count one reuse of `key`: a visitor who opened the shared
 * link acting on it (running it, editing it, taking it as theirs). Only a
 * link already counted as opened gets one: no document is made here. With
 * skipFirstOpener, a visitor whose pseudonym is the link's first opener isn't
 * counted, on the guess that the first to open a link is often its maker
 * checking it; that is approximate both ways (a maker may never open their
 * own link through the server, and IPs change). The reuser's pseudonym is
 * kept while fewer than MAX_IP_HASHES are.
 */
export function shareUseWrites({ key, ipHash, now, skipFirstOpener = true }) {
  const filter = skipFirstOpener
    ? { _id: key, "ipHashes.0": { $ne: ipHash } }
    : { _id: key };
  return [
    {
      updateOne: {
        filter,
        update: { $inc: { reuses: 1 }, $set: { lastReuseAt: now } },
      },
    },
    {
      updateOne: {
        filter: { ...filter, [`reuserHashes.${MAX_IP_HASHES - 1}`]: { $exists: false } },
        update: { $addToSet: { reuserHashes: ipHash } },
      },
    },
  ];
}
