import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IP_HASHES,
  MAX_SHARE_QUERY_LENGTH,
  isCrawler,
  shareKey,
  shareOpenWrites,
  shareUseKey,
  shareUseWrites,
  sharedRunKey,
  withOpeners,
} from "../../../../gakumas-tools/utils/shareOpens.js";

const params = (query) => new URLSearchParams(query);

test("shareKey keys a simulator link on what it carries, not on order or extra params", () => {
  const key = shareKey("simulator", params("stage=1&params=1-2-3&items=4&cards=5-6"));
  assert.match(key, /^[0-9a-f]{24}$/);
  assert.equal(
    shareKey("simulator", params("cards=5-6&utm_source=x&items=4&stage=1&params=1-2-3")),
    key,
  );
  assert.notEqual(shareKey("simulator", params("stage=1&params=1-2-3&items=4&cards=5-7")), key);
  assert.notEqual(shareKey("tierList", params("stage=1&params=1-2-3&items=4&cards=5-6&d=x")), key);
});

test("shareKey counts multi-phase simulator links and tier lists, and skips links that carry nothing", () => {
  assert.ok(shareKey("simulator", params("loadout=a&loadout=b")));
  assert.notEqual(
    shareKey("simulator", params("loadout=a&loadout=b")),
    shareKey("simulator", params("loadout=b&loadout=a")),
  );
  assert.ok(shareKey("tierList", params("type=skillCard&d=abc")));
  assert.equal(shareKey("simulator", params("stage=1")), null);
  assert.equal(shareKey("simulator", params("cards=")), null);
  assert.equal(shareKey("tierList", params("type=skillCard")), null);
  assert.equal(shareKey("memories", params("d=abc")), null);
});

test("isCrawler tells link-preview fetchers from people", () => {
  for (const ua of [
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "facebookexternalhit/1.1;line-poker/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "curl/8.5.0",
    "",
    null,
  ]) {
    assert.equal(isCrawler(ua), true, String(ua));
  }
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone",
  ]) {
    assert.equal(isCrawler(ua), false, ua);
  }
});

test("shareOpenWrites counts an open and adds the opener while the list has room", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const [count, opener] = shareOpenWrites({ key: "k", kind: "tierList", ipHash: "ip1", crawler: false, now });
  assert.deepEqual(count.updateOne, {
    filter: { _id: "k" },
    update: { $setOnInsert: { kind: "tierList", firstAt: now }, $set: { lastAt: now }, $inc: { opens: 1 } },
    upsert: true,
  });
  assert.deepEqual(opener.updateOne, {
    filter: { _id: "k", [`ipHashes.${MAX_IP_HASHES - 1}`]: { $exists: false } },
    update: { $addToSet: { ipHashes: "ip1" } },
  });
});

test("shareOpenWrites counts a crawler as an unfurl and adds no opener", () => {
  const writes = shareOpenWrites({ key: "k", kind: "simulator", ipHash: "ip1", crawler: true, now: new Date(0) });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].updateOne.update.$inc, { unfurls: 1 });
});

test("shareKey counts a shared run by its id alone", () => {
  const key = shareKey("sharedRun", new URLSearchParams({ id: "aB3xY9" }));
  assert.match(key, /^[0-9a-f]{24}$/);
  assert.equal(shareKey("sharedRun", new URLSearchParams("id=aB3xY9&utm_source=x")), key);
  assert.notEqual(shareKey("sharedRun", new URLSearchParams({ id: "other1" })), key);
  assert.notEqual(shareKey("simulator", new URLSearchParams({ loadout: "aB3xY9" })), key);
  assert.equal(shareKey("sharedRun", new URLSearchParams()), null);
});

// A db with just enough of shareOpens for withOpeners: find by _id $in.
function opensDb(docs, { fail = false } = {}) {
  return {
    collection(name) {
      assert.equal(name, "shareOpens");
      return {
        find(filter) {
          if (fail) throw new Error("down");
          const ids = new Set(filter._id.$in);
          return { toArray: async () => docs.filter((doc) => ids.has(doc._id)) };
        },
      };
    },
  };
}

test("sharedRunKey is the key /s/<id> opens are counted under", () => {
  assert.equal(sharedRunKey("AbC12345"), shareKey("sharedRun", params("id=AbC12345")));
  assert.notEqual(sharedRunKey("AbC12345"), sharedRunKey("AbC12346"));
});

test("withOpeners counts each run's distinct openers, 0 for a run no one opened", async () => {
  const db = opensDb([
    { _id: sharedRunKey("AAAAAAAA"), opens: 9, ipHashes: ["a", "b", "c"] },
    { _id: sharedRunKey("BBBBBBBB"), opens: 2, unfurls: 4 },
    { _id: sharedRunKey("ZZZZZZZZ"), opens: 1, ipHashes: ["z"] },
  ]);
  const runs = await withOpeners(db, [
    { id: "AAAAAAAA", name: "a" },
    { id: "BBBBBBBB" },
    { id: "CCCCCCCC" },
  ]);
  assert.deepEqual(
    runs.map(({ id, openedBy, openedByMore }) => [id, openedBy, openedByMore]),
    [
      ["AAAAAAAA", 3, false],
      ["BBBBBBBB", 0, false],
      ["CCCCCCCC", 0, false],
    ],
  );
  assert.equal(runs[0].name, "a");
});

test("withOpeners says 'or more' once the kept openers are full", async () => {
  const full = Array.from({ length: MAX_IP_HASHES }, (_, i) => `ip${i}`);
  const db = opensDb([{ _id: sharedRunKey("AAAAAAAA"), ipHashes: full }]);
  const [run] = await withOpeners(db, [{ id: "AAAAAAAA" }]);
  assert.equal(run.openedBy, MAX_IP_HASHES);
  assert.equal(run.openedByMore, true);
});

test("withOpeners leaves the runs as they were if the counts can't be read", async () => {
  const runs = [{ id: "AAAAAAAA" }];
  assert.deepEqual(await withOpeners(opensDb([], { fail: true }), runs), runs);
  assert.deepEqual(await withOpeners(opensDb([]), []), []);
});

test("shareUseKey keys a reuse report like the open it follows, and refuses what isn't one", () => {
  assert.equal(
    shareUseKey({ kind: "simulator", query: "stage=1&cards=5-6" }),
    shareKey("simulator", params("stage=1&cards=5-6")),
  );
  assert.equal(shareUseKey({ kind: "simulator", query: "?cards=5-6" }), shareKey("simulator", params("cards=5-6")));
  assert.equal(shareUseKey({ kind: "sharedRun", query: "id=AbC12345" }), sharedRunKey("AbC12345"));
  assert.equal(shareUseKey({ kind: "simulator", query: "stage=1" }), null);
  for (const kind of ["memories", "constructor", "__proto__", "toString", 3, null]) {
    assert.equal(shareUseKey({ kind, query: "cards=1&d=x&id=y" }), null, String(kind));
  }
  assert.equal(shareUseKey({ kind: "tierList", query: ["d=x"] }), null);
  assert.equal(shareUseKey({ kind: "tierList" }), null);
  assert.equal(shareUseKey({ kind: "simulator", query: `cards=${"1".repeat(MAX_SHARE_QUERY_LENGTH)}` }), null);
  assert.equal(shareUseKey(null), null);
});

test("shareUseWrites counts a reuse only on a link already opened, not by its first opener", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const writes = shareUseWrites({ key: "k", ipHash: "ip2", now });
  assert.equal(writes.length, 2);
  const [count, reuser] = writes;
  assert.deepEqual(count.updateOne, {
    filter: { _id: "k", "ipHashes.0": { $ne: "ip2" } },
    update: { $inc: { reuses: 1 }, $set: { lastReuseAt: now } },
  });
  assert.deepEqual(reuser.updateOne, {
    filter: {
      _id: "k",
      "ipHashes.0": { $ne: "ip2" },
      [`reuserHashes.${MAX_IP_HASHES - 1}`]: { $exists: false },
    },
    update: { $addToSet: { reuserHashes: "ip2" } },
  });
  for (const { updateOne } of writes) {
    assert.equal(updateOne.upsert, undefined);
    assert.equal(updateOne.update.$setOnInsert, undefined);
  }
});

test("shareUseWrites can count the first opener too (a shared run's opens skip its owner)", () => {
  const [count, reuser] = shareUseWrites({ key: "k", ipHash: "ip1", now: new Date(0), skipFirstOpener: false });
  assert.deepEqual(count.updateOne.filter, { _id: "k" });
  assert.deepEqual(reuser.updateOne.filter, { _id: "k", [`reuserHashes.${MAX_IP_HASHES - 1}`]: { $exists: false } });
});
