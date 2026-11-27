import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The route writes through connect(); hand it a db that records the writes.
let writes;
let failWrites;
const db = {
  collection(name) {
    assert.equal(name, "shareOpens");
    return {
      async bulkWrite(ops, options) {
        if (failWrites) throw new Error("down");
        writes.push({ ops, options });
      },
    };
  },
};
globalThis.mongo = { conn: { client: {}, db }, promise: null };

const { POST } = await import("../../../../../../gakumas-tools/app/api/share-use/route.js");
const { sharedRunKey, shareKey } = await import("../../../../../../gakumas-tools/utils/shareOpens.js");

const BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
let ip = 0;

function post(body, { ua = BROWSER, from = `10.0.0.${++ip}` } = {}) {
  return POST(
    new Request("http://localhost/api/share-use", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": ua, "cf-connecting-ip": from },
      body: typeof body == "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  writes = [];
  failWrites = false;
});

test("a reuse of a shared simulator link writes its reuse to the link's key", async () => {
  const res = await post({ kind: "simulator", query: "stage=1&cards=5-6&utm_source=x" });
  assert.equal(res.status, 204);
  assert.equal(writes.length, 1);
  const [count, reuser] = writes[0].ops;
  assert.equal(count.updateOne.filter._id, shareKey("simulator", new URLSearchParams("cards=5-6&stage=1")));
  assert.ok(count.updateOne.filter["ipHashes.0"].$ne);
  assert.deepEqual(count.updateOne.update.$inc, { reuses: 1 });
  assert.equal(reuser.updateOne.update.$addToSet.reuserHashes, count.updateOne.filter["ipHashes.0"].$ne);
  assert.equal(writes[0].options.ordered, true);
});

test("a shared run's reuse isn't held back by its first opener", async () => {
  await post({ kind: "sharedRun", query: "id=AbC12345" });
  const [count] = writes[0].ops;
  assert.deepEqual(count.updateOne.filter, { _id: sharedRunKey("AbC12345") });
});

test("links that carry nothing shared, unknown kinds and crawlers write nothing", async () => {
  for (const body of [
    { kind: "simulator", query: "stage=1" },
    { kind: "tierList", query: "type=skillCard" },
    { kind: "memories", query: "d=x" },
    { kind: "__proto__", query: "d=x" },
    { kind: "simulator" },
    { query: "cards=1" },
  ]) {
    const res = await post(body);
    assert.equal(res.status, 204, JSON.stringify(body));
  }
  const res = await post({ kind: "simulator", query: "cards=1" }, { ua: "Discordbot/2.0" });
  assert.equal(res.status, 204);
  assert.deepEqual(writes, []);
});

test("bad bodies are refused before anything is written", async () => {
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post("[1]")).status, 400);
  assert.equal((await post({ kind: "simulator", query: `cards=${"1".repeat(25_000)}` })).status, 413);
  assert.deepEqual(writes, []);
});

test("a failed write still answers 204: the count is best effort", async () => {
  failWrites = true;
  const res = await post({ kind: "tierList", query: "type=skillCard&d=abc" });
  assert.equal(res.status, 204);
});

test("one visitor is limited to 60 reports an hour", async () => {
  const from = "10.9.9.9";
  for (let i = 0; i < 60; i++) {
    assert.equal((await post({ kind: "simulator", query: `cards=${i}` }, { from })).status, 204);
  }
  assert.equal((await post({ kind: "simulator", query: "cards=x" }, { from })).status, 429);
  assert.equal(writes.length, 60);
  assert.equal((await post({ kind: "simulator", query: "cards=x" })).status, 204);
});
