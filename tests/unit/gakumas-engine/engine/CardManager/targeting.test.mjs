import { test } from "node:test";
import assert from "node:assert/strict";
import { SkillCards, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  S,
  StageConfig,
  StageEngine,
} from "gakumas-engine";

// プレシーズンA, a three-idol link contest.
const LINK_STAGE_ID = 121;

// Non-unique SR/SSR sense cards with no effects of their own.
const POOL = SkillCards.getAll()
  .filter(
    (c) =>
      ["SR", "SSR"].includes(c.rarity) &&
      c.sourceType === "produce" &&
      !c.upgraded &&
      ["sense", "free"].includes(c.plan) &&
      !c.effects?.length &&
      !c.unique,
  )
  .map((c) => c.id);

function linkEngine(loadouts) {
  const stage = new StageConfig(Stages.getById(LINK_STAGE_ID));
  const configs = loadouts.map(
    ({ pItemIds = [], skillCardIds }) =>
      new IdolStageConfig(
        new IdolConfig({
          params: [1000, 1000, 1000, 50],
          supportBonus: 0,
          pItemIds,
          skillCardIdGroups: [skillCardIds],
          customizationGroups: [[]],
        }),
        stage,
      ),
  );
  const engine = new StageEngine(configs[0], configs);
  engine.logger.disable();
  return engine;
}

const targets = (engine, state, rule) =>
  [...engine.cardManager.getTargetRuleCards(state, rule, null)].sort(
    (a, b) => a - b,
  );

test("link contest targets only see the current idol's cards", () => {
  const engine = linkEngine([
    { skillCardIds: POOL.slice(0, 4) },
    { skillCardIds: POOL.slice(4, 8) },
    { skillCardIds: POOL.slice(8, 12) },
  ]);
  let state = engine.getInitialState();
  const first = [...state[S.deckCards]].sort((a, b) => a - b);
  assert.deepEqual(targets(engine, state, "all"), first);
  for (const rule of ["SR", "active", "mental", String(POOL[5])]) {
    assert.ok(targets(engine, state, rule).every((k) => first.includes(k)));
  }

  // A card added during the first idol's phase belongs to that phase only.
  engine.cardManager.addCardToDeck(state, 5);
  const added = state[S.cardMap].length - 1;
  assert.ok(targets(engine, state, "all").includes(added));

  engine.changeIdol(state);
  const second = [...state[S.deckCards]].sort((a, b) => a - b);
  assert.deepEqual(targets(engine, state, "all"), second);
  assert.ok(!targets(engine, state, "all").includes(added));
});

test("はつぼし記章 counts only the current idol's non-N cards in a link contest", () => {
  // はつぼし記章 (371) needs 21+ non-N cards. The first idol has 10, and
  // the other two idols' 16 more must not count.
  const engine = linkEngine([
    { pItemIds: [371], skillCardIds: [...POOL.slice(0, 10), 1, 3] },
    { skillCardIds: POOL.slice(10, 18) },
    { skillCardIds: POOL.slice(10, 18) },
  ]);
  let state = engine.getInitialState();
  state[S.stamina] = 20;
  state = engine.startStage(state);
  assert.equal(state[S.stamina], 20);
  assert.equal(state[S.removedCards].length, 0);
});

test("outside link contests every card is targeted", () => {
  const stage = new StageConfig(Stages.getById(1));
  const engine = new StageEngine(
    new IdolStageConfig(
      new IdolConfig({
        params: [1000, 1000, 1000, 50],
        supportBonus: 0,
        pItemIds: [],
        skillCardIdGroups: [POOL.slice(0, 4)],
        customizationGroups: [[]],
      }),
      stage,
    ),
  );
  engine.logger.disable();
  const state = engine.getInitialState();
  engine.cardManager.addCardToDeck(state, 5);
  assert.deepEqual(
    targets(engine, state, "all"),
    state[S.cardMap].map((_, k) => k),
  );
});
