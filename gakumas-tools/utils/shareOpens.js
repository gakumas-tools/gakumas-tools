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
