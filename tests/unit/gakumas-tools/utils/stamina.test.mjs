import { test } from "node:test";
import assert from "node:assert/strict";
import { getLoadoutStaminaContributions } from "../../../../gakumas-tools/utils/stamina.js";

test("contest loadout stamina includes 20% of the secondary memory", () => {
  assert.deepEqual(getLoadoutStaminaContributions([41, 42], [1, 0.2]), [
    41, 8,
  ]);
});

test("link contest loadout stamina includes every memory at full value", () => {
  assert.deepEqual(getLoadoutStaminaContributions([41, 42], [1, 1]), [41, 42]);
});
