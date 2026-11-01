import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePossibleMemories } from "../../../../gakumas-tools/utils/skillCardLottery.js";
import {
  calculateSkillCardCost,
  COST_RANGES_BY_RANK,
} from "../../../../gakumas-tools/utils/contestPower.js";

const costs = (memories) =>
  memories.map(({ skillCardIds }) => calculateSkillCardCost(skillCardIds));

test("only in-range combinations are drawn when any exist", () => {
  // 軽い足取り 30, 心・技・体 150, 手書きのメッセージ+ 204, 開花+ 204, 飛躍+ 141.
  // The first 3-card combination under rank A's max costs 438, below its min,
  // but two in-range combinations exist.
  const { min, max } = COST_RANGES_BY_RANK.A;
  const memories = generatePossibleMemories([24, 432, 177, 151, 79], "A");
  assert.ok(memories.length > 0);
  for (const cost of costs(memories)) {
    assert.ok(cost >= min && cost <= max, `cost ${cost} not in ${min}-${max}`);
  }
  const total = memories.reduce((sum, m) => sum + m.probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});
