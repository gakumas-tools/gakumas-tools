import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../../../gakumas-tools/package.json", import.meta.url),
);
const { MongoClient } = require("mongodb");
const { connect } = await import("../../../../gakumas-tools/utils/mongodb.js");

const db = {};
const client = { db: () => db };

beforeEach(() => {
  globalThis.mongo.conn = null;
  globalThis.mongo.promise = null;
});

test("a failed connection is retried on the next request", async () => {
  let attempts = 0;
  MongoClient.connect = async () => {
    if (++attempts === 1) throw new Error("outage");
    return client;
  };
  await assert.rejects(connect(), /outage/);
  assert.deepEqual(await connect(), { client, db });
  await connect();
  assert.equal(attempts, 2);
});

test("concurrent requests share one connection", async () => {
  let attempts = 0;
  MongoClient.connect = async () => {
    attempts++;
    return client;
  };
  const [a, b] = await Promise.all([connect(), connect()]);
  assert.equal(a, b);
  assert.equal(attempts, 1);
});
