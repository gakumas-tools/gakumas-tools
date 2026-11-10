import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  PItems,
  SkillCards,
  Stages,
} from "gakumas-data";
import {
  defaultPools,
  getDefaultParams,
  loadoutProblems,
  optimizeLoadout,
  playScores,
  stageConfigFor,
} from "gakumas-engine";

const YELLOW_BIG_BANG_CARD = 279;
const YELLOW_BIG_BANG_ITEM = 90;
const GARAKUTA_ROAD_CARD = 816;

const deck = (skillCardIdGroups, pItemIds = [0, 0, 0, 0]) => ({
  skillCardIdGroups,
  pItemIds,
});

function signaturePItemOfAnotherPIdol(...pIdolIds) {
  return PItems.getAll().find(
    (item) => item.sourceType == "pIdol" && !pIdolIds.includes(item.pIdolId),
  ).id;
}

test("a loadout of two memories' signatures has no problems", () => {
  const loadout = deck(
    [[YELLOW_BIG_BANG_CARD], [GARAKUTA_ROAD_CARD]],
    [YELLOW_BIG_BANG_ITEM],
  );
  assert.deepEqual(loadoutProblems(loadout), []);
});

test("a unique card counts with its upgrade as one card", () => {
  const card = SkillCards.getById(YELLOW_BIG_BANG_CARD);
  const base = SkillCards.getAll().find(
    (c) => c.pIdolId == card.pIdolId && !c.upgraded,
  );
  assert.equal(
    loadoutProblems(deck([[YELLOW_BIG_BANG_CARD], [base.id]])).length,
    1,
  );
});

test("a memory holds one p-idol's signature cards", () => {
  assert.equal(
    loadoutProblems(deck([[YELLOW_BIG_BANG_CARD, GARAKUTA_ROAD_CARD], []]))
      .length,
    1,
  );
});

test("signatures from more p-idols than memories are a problem", () => {
  const third = signaturePItemOfAnotherPIdol(
    SkillCards.getById(YELLOW_BIG_BANG_CARD).pIdolId,
    SkillCards.getById(GARAKUTA_ROAD_CARD).pIdolId,
  );
  const loadout = deck(
    [[YELLOW_BIG_BANG_CARD], [GARAKUTA_ROAD_CARD]],
    [third, 0, 0, 0],
  );
  assert.equal(loadoutProblems(loadout).length, 1);
});

test("a P-item twice is a problem", () => {
  const loadout = deck([[]], [YELLOW_BIG_BANG_ITEM, YELLOW_BIG_BANG_ITEM]);
  assert.equal(loadoutProblems(loadout).length, 1);
});

test("default pools hold shown upgraded cards and stage P-items of the plan", () => {
  const stage = Stages.getById(190);
  const { cardPool, pItemPool } = defaultPools(
    stage,
    deck([[YELLOW_BIG_BANG_CARD]]),
  );
  assert.ok(cardPool.includes(GARAKUTA_ROAD_CARD));
  for (const id of cardPool) {
    const card = SkillCards.getById(id);
    assert.ok(card.upgraded && ["sense", "free"].includes(card.plan), id);
    assert.ok(!HIDDEN_CARD_IDS.has(id), id);
  }
  for (const id of pItemPool) {
    const item = PItems.getById(id);
    assert.ok(item.mode == "stage" && ["sense", "free"].includes(item.plan));
    assert.ok(!HIDDEN_ITEM_IDS.has(id), id);
  }
});

test("optimizing fills open slots and replays the best on holdout seeds", async () => {
  const stage = Stages.getById(190);
  const loadout = {
    params: getDefaultParams(stage),
    supportBonus: 0.1,
    ...deck([[YELLOW_BIG_BANG_CARD, 0, 0]], [YELLOW_BIG_BANG_ITEM, 0]),
    customizationGroups: [[]],
  };
  const result = await optimizeLoadout({
    stage,
    loadout,
    cardPool: [GARAKUTA_ROAD_CARD, 762, 752],
    pItemPool: [141, 71],
    seed: 7,
    runs: 3,
    holdoutRuns: 4,
  });

  assert.ok(result.converged);
  assert.equal(result.loadout.skillCardIdGroups[0][0], YELLOW_BIG_BANG_CARD);
  assert.equal(result.loadout.pItemIds[0], YELLOW_BIG_BANG_ITEM);
  assert.deepEqual(loadoutProblems(result.loadout), []);
  assert.ok(result.improvements.length > 0);

  const config = stageConfigFor(stage, result.loadout);
  const mean = (scores) =>
    scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const search = await playScores(config, null, { seed: 7, runs: 3 });
  const holdout = await playScores(config, null, { seed: 10, runs: 4 });
  assert.equal(result.searchMean, mean(search));
  assert.equal(result.holdout.mean, mean(holdout));
  assert.ok(result.searchMean >= result.improvements[0].mean);
});

test("optimizing stops at its deadline", async () => {
  const stage = Stages.getById(190);
  const result = await optimizeLoadout({
    stage,
    loadout: {
      params: getDefaultParams(stage),
      ...deck([[YELLOW_BIG_BANG_CARD, 0]]),
    },
    cardPool: [762, 752],
    pItemPool: [],
    seed: 0,
    runs: 1,
    holdoutRuns: 1,
    deadline: 0,
  });
  assert.ok(result.timedOut);
  assert.equal(result.evaluations, 1);
});
