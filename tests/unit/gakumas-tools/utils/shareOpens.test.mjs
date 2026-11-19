import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IP_HASHES,
  isCrawler,
  shareKey,
  shareOpenWrites,
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
