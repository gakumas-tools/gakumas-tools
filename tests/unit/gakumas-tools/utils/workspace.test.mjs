import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORKSPACE,
  parseWorkspace,
  serializeWorkspace,
} from "../../../../gakumas-tools/utils/workspace.js";

test("a workspace round-trips through its cookie value", () => {
  for (const filter of [true, false]) {
    const workspace = { filter, plan: "logic", idolId: 3, pinnedTools: [] };
    assert.deepEqual(parseWorkspace(serializeWorkspace(workspace)), workspace);
  }
});

test("missing or malformed values fall back to the defaults", () => {
  assert.deepEqual(parseWorkspace(""), DEFAULT_WORKSPACE);
  assert.deepEqual(parseWorkspace("not json"), DEFAULT_WORKSPACE);
  assert.equal(parseWorkspace(JSON.stringify({ filter: "no" })).filter, true);
});
