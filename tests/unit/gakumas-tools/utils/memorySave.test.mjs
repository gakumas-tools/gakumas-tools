import { test } from "node:test";
import assert from "node:assert/strict";
import { getSaveOutcome } from "../../../../gakumas-tools/utils/memorySave.js";

test("a save that returns unchanged marks the memory saved", () => {
  assert.deepEqual(
    getSaveOutcome({
      savedDocument: 1,
      currentDocument: 1,
      savedRevision: 4,
      currentRevision: 4,
    }),
    { applyId: true, saveState: "saved", clean: true },
  );
});

test("edits made while saving stay unsaved", () => {
  assert.deepEqual(
    getSaveOutcome({
      savedDocument: 1,
      currentDocument: 1,
      savedRevision: 4,
      currentRevision: 5,
    }),
    { applyId: true, saveState: "unsaved", clean: false },
  );
});

test("a save that returns after another memory was loaded changes nothing", () => {
  // Saving memory A, then opening a new memory: A's id must not be applied,
  // or the new memory's first save would overwrite A.
  assert.deepEqual(
    getSaveOutcome({
      savedDocument: 1,
      currentDocument: 2,
      savedRevision: 4,
      currentRevision: 5,
    }),
    { applyId: false, saveState: null, clean: false },
  );
});
