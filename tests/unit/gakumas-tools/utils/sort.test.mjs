import { test } from "node:test";
import assert from "node:assert/strict";
import { compareUnfilteredMemories } from "../../../../gakumas-tools/utils/sort.js";

test("FIXME memories come first, each group ordered by contest power", () => {
  const memories = [
    { name: "A (FIXME)", contestPower: 100 },
    { name: "B (FIXME)", contestPower: 300 },
    { name: "C", contestPower: 500 },
    { name: "D (FIXME)", contestPower: 200 },
    { name: "E", contestPower: 700 },
    { contestPower: 600 },
  ];
  assert.deepEqual(
    memories.sort(compareUnfilteredMemories).map((m) => m.contestPower),
    [300, 200, 100, 700, 600, 500],
  );
});
