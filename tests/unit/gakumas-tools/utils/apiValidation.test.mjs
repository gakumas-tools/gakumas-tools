import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MEMORIES_PER_USER,
  MAX_NAME_LENGTH,
  cleanMemories,
  cleanMemory,
  isName,
  isObjectId,
  isObjectIdList,
  readJsonBody,
  validateLoadout,
} from "../../../../gakumas-tools/utils/apiValidation.js";

const ID = "652f1c2b9d3e4a0012345678";

const editorMemory = {
  name: "テスト",
  pIdolId: 12,
  params: [1200, 1300, null, 40],
  pItemIds: [101, 0, 0, 0],
  skillCardIds: [1, 2, 3, 0, 0, 0],
  customizations: [{}, { 1: 2 }, {}, {}, {}, {}],
};

const savedRun = {
  name: "run 1",
  stageId: 52,
  customStage: {},
  supportBonus: 0.04,
  params: [1200, 1300, 1400, 40],
  pItemIds: [101, 0, 0, 0],
  skillCardIdGroups: [[1, 2, 3, 0, 0, 0]],
  customizationGroups: [[{}, {}, {}, {}, {}, {}]],
  linkLoadouts: null,
  stats: { count: 1000, mean: 12345, buckets: [1, 2, 3] },
  derived: { stageName: "x", season: 30, signatureCardId: 1 },
};

const request = (text) => new Request("http://x/", { method: "POST", body: text });

test("readJsonBody parses an object body under the cap", async () => {
  assert.deepEqual(await readJsonBody(request('{"a":1}'), 100), {
    body: { a: 1 },
  });
});

test("readJsonBody rejects an oversized body with 413", async () => {
  const result = await readJsonBody(request(JSON.stringify({ a: "x".repeat(200) })), 100);
  assert.equal(result.status, 413);
});

test("readJsonBody counts bytes, not characters", async () => {
  const result = await readJsonBody(request(JSON.stringify({ a: "あ".repeat(40) })), 100);
  assert.equal(result.status, 413);
});

test("readJsonBody rejects a declared oversized body without reading it", async () => {
  const req = new Request("http://x/", {
    method: "POST",
    headers: { "content-length": "101" },
    body: "{}",
  });
  assert.equal((await readJsonBody(req, 100)).status, 413);
  assert.equal(req.bodyUsed, false);
});

test("readJsonBody rejects invalid JSON and non-object bodies with 400", async () => {
  for (const text of ["{", "[]", "null", '"x"', "3"]) {
    assert.equal((await readJsonBody(request(text), 100)).status, 400, text);
  }
});

test("isObjectId accepts 24-hex strings only", () => {
  assert.equal(isObjectId(ID), true);
  for (const bad of ["abc", "zz2f1c2b9d3e4a0012345678", 123, null, {}, ["x"]]) {
    assert.equal(isObjectId(bad), false, String(bad));
  }
});

test("isObjectIdList rejects non-arrays, empty arrays and bad entries", () => {
  assert.equal(isObjectIdList([ID, ID]), true);
  for (const bad of [ID, {}, null, [], [ID, "nope"], [{ $gt: "" }]]) {
    assert.equal(isObjectIdList(bad), false, JSON.stringify(bad));
  }
  assert.equal(isObjectIdList(Array(MAX_MEMORIES_PER_USER + 1).fill(ID)), false);
});

test("isName requires a string within the length cap", () => {
  assert.equal(isName(""), true);
  assert.equal(isName("x".repeat(MAX_NAME_LENGTH)), true);
  assert.equal(isName("x".repeat(MAX_NAME_LENGTH + 1)), false);
  for (const bad of [null, 1, {}, ["a"], { $set: 1 }]) {
    assert.equal(isName(bad), false);
  }
});

test("cleanMemory keeps the editor's payload and drops unknown fields", () => {
  assert.deepEqual(cleanMemory({ ...editorMemory, userId: "other" }), editorMemory);
  assert.deepEqual(cleanMemory({ ...editorMemory, name: null }), {
    ...editorMemory,
    name: null,
  });
});

test("cleanMemory rejects wrong field types", () => {
  for (const patch of [
    { name: 5 },
    { name: "x".repeat(MAX_NAME_LENGTH + 1) },
    { pIdolId: {} },
    { params: "x" },
    { pItemIds: { 0: 1 } },
    { skillCardIds: Array(101).fill(0) },
    { customizations: {} },
  ]) {
    assert.equal(cleanMemory({ ...editorMemory, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(cleanMemory(null), null);
  assert.equal(cleanMemory([]), null);
});

test("cleanMemories rejects non-arrays, empty arrays and oversized batches", () => {
  assert.deepEqual(cleanMemories([editorMemory]), [editorMemory]);
  for (const bad of [undefined, null, {}, "x", editorMemory, []]) {
    assert.equal(cleanMemories(bad), null, JSON.stringify(bad));
  }
  assert.equal(cleanMemories([editorMemory, 5]), null);
  assert.equal(cleanMemories(Array(MAX_MEMORIES_PER_USER + 1).fill(editorMemory)), null);
});

test("validateLoadout accepts a saved run and rejects wrong field types", () => {
  assert.equal(validateLoadout(savedRun), null);
  assert.equal(validateLoadout({ ...savedRun, linkLoadouts: [savedRun] }), null);
  for (const patch of [
    { name: 5 },
    { name: { $gt: "" } },
    { params: "x" },
    { skillCardIdGroups: {} },
    { linkLoadouts: "x" },
    { stats: [1] },
    { derived: "x" },
    { customStage: 3 },
  ]) {
    assert.notEqual(validateLoadout({ ...savedRun, ...patch }), null, JSON.stringify(patch));
  }
});
