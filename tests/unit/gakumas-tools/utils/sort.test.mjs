import { test } from "node:test";
import assert from "node:assert/strict";
import { compareUnfilteredMemories } from "../../../../gakumas-tools/utils/sort.js";

const memory = (name, contestPower) => ({ name, contestPower });

test("puts flagged memories first, each group by contest power", () => {
  const memories = [
    memory("A", 300),
    memory("1200 (FIXME)", 1200),
    memory("B", 900),
    memory("800 (FIXME)", 800),
    memory("2000 (FIXME)", 2000),
    memory(undefined, 500),
  ];
  assert.deepEqual(
    memories.sort(compareUnfilteredMemories).map((m) => m.contestPower),
    [2000, 1200, 800, 900, 500, 300]
  );
});

test("compares two flagged memories symmetrically", () => {
  const a = memory("1200 (FIXME)", 1200);
  const b = memory("800 (FIXME)", 800);
  assert.ok(compareUnfilteredMemories(a, b) < 0);
  assert.ok(compareUnfilteredMemories(b, a) > 0);
});
