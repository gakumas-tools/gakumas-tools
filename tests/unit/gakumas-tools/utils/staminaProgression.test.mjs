import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STAMINA_PROGRESSION,
  STAMINA_PROGRESSION_STORAGE_KEY,
  loadStaminaProgression,
  saveStaminaProgression,
} from "../../../../gakumas-tools/utils/staminaProgression.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("stamina progression is remembered independently for each P-idol", () => {
  const storage = createMemoryStorage();

  saveStaminaProgression(24, { trainingRank: 4, awakeningRank: 0 }, storage);
  saveStaminaProgression(26, { trainingRank: 5, awakeningRank: 2 }, storage);

  assert.deepEqual(loadStaminaProgression(24, storage), {
    trainingRank: 4,
    awakeningRank: 0,
  });
  assert.deepEqual(loadStaminaProgression(26, storage), {
    trainingRank: 5,
    awakeningRank: 2,
  });
});

test("missing or invalid saved progression falls back to maxed defaults", () => {
  const storage = createMemoryStorage({
    [STAMINA_PROGRESSION_STORAGE_KEY]: JSON.stringify({
      24: { trainingRank: 8, awakeningRank: 2 },
    }),
  });

  assert.deepEqual(loadStaminaProgression(24, storage), {
    trainingRank: DEFAULT_STAMINA_PROGRESSION.trainingRank,
    awakeningRank: 2,
  });
  assert.deepEqual(
    loadStaminaProgression(26, storage),
    DEFAULT_STAMINA_PROGRESSION,
  );
  const corruptStorage = createMemoryStorage({
    [STAMINA_PROGRESSION_STORAGE_KEY]: "not json",
  });
  assert.deepEqual(
    loadStaminaProgression(26, corruptStorage),
    DEFAULT_STAMINA_PROGRESSION,
  );

  saveStaminaProgression(
    26,
    { trainingRank: 3, awakeningRank: 1 },
    corruptStorage,
  );
  assert.deepEqual(loadStaminaProgression(26, corruptStorage), {
    trainingRank: 3,
    awakeningRank: 1,
  });
});

test("blocked browser storage does not prevent stamina calculation", () => {
  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.deepEqual(
    loadStaminaProgression(24, blockedStorage),
    DEFAULT_STAMINA_PROGRESSION,
  );
  assert.doesNotThrow(() =>
    saveStaminaProgression(
      24,
      { trainingRank: 4, awakeningRank: 0 },
      blockedStorage,
    ),
  );
});
