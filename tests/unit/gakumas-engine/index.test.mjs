import { test } from "node:test";
import assert from "node:assert/strict";
import { Customizations, PItems, SkillCards, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
  resetRand,
} from "gakumas-engine";

// The engine reports what it can't evaluate (unknown identifiers, actions,
// operators, intermediates) with console.warn and carries on, so a bad
// effect only shows up as a quietly wrong score. Play every skill card,
// P-item, stage and card customization once and fail on any warning or
// error.

const FILLER_CARD_IDS = [1, 3, 5, 7, 9];
const PARAMS = [1500, 1500, 1500, 40];

const latestStageIdByPlan = {};
for (const stage of Stages.getAll()) {
  if (stage.type !== "contest" || stage.preview) continue;
  if (!(latestStageIdByPlan[stage.plan] > stage.id)) {
    latestStageIdByPlan[stage.plan] = stage.id;
  }
}
const stageIdFor = (plan) =>
  latestStageIdByPlan[plan] ?? latestStageIdByPlan.free;

async function play({
  plan,
  stageId = stageIdFor(plan),
  pItemIds = [],
  skillCardIds,
  customizations = [],
}) {
  resetRand();
  const idol = new IdolConfig({
    params: PARAMS,
    supportBonus: 0.04,
    pItemIds,
    skillCardIdGroups: [skillCardIds],
    customizationGroups: [customizations],
  });
  const stage = new StageConfig(Stages.getById(stageId));
  const engine = new StageEngine(new IdolStageConfig(idol, stage));
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  return new StagePlayer(engine, strategy).play();
}

async function collectWarnings(cases) {
  const warnings = [];
  let current;
  const orig = { warn: console.warn, error: console.error };
  console.warn = (...args) => warnings.push(`${current}: ${args.join(" ")}`);
  console.error = console.warn;
  try {
    for (const { name, ...loadout } of cases) {
      current = name;
      const { score } = await play(loadout);
      if (!Number.isFinite(score)) warnings.push(`${name}: score ${score}`);
    }
  } finally {
    Object.assign(console, orig);
  }
  return warnings;
}

test("every skill card plays without engine warnings", async () => {
  const cases = SkillCards.getAll().map((card) => ({
    name: `skill card ${card.id} ${card.name}`,
    plan: card.plan,
    skillCardIds: [card.id, card.id, ...FILLER_CARD_IDS],
  }));
  assert.deepEqual(await collectWarnings(cases), []);
});

test("every P-item plays without engine warnings", async () => {
  const cases = PItems.getAll().map((pItem) => ({
    name: `P-item ${pItem.id} ${pItem.name}`,
    plan: pItem.plan,
    pItemIds: [pItem.id],
    skillCardIds: FILLER_CARD_IDS,
  }));
  assert.deepEqual(await collectWarnings(cases), []);
});

// Link contests need one config per idol, which this harness doesn't build.
test("every contest and event stage plays without engine warnings", async () => {
  const cases = Stages.getAll()
    .filter((stage) => stage.type !== "linkContest")
    .map((stage) => ({
      name: `stage ${stage.id} ${stage.name}`,
      stageId: stage.id,
      skillCardIds: FILLER_CARD_IDS,
    }));
  assert.ok(cases.length > 0);
  assert.deepEqual(await collectWarnings(cases), []);
});

test("every card customization plays without engine warnings", async () => {
  const cases = [];
  for (const card of SkillCards.getAll()) {
    for (const id of card.availableCustomizations || []) {
      const customization = Customizations.getById(id);
      assert.ok(customization, `card ${card.id} offers unknown customization ${id}`);
      for (let level = 1; level <= (customization.max || 1); level++) {
        cases.push({
          name: `skill card ${card.id} ${card.name} customization ${id}x${level}`,
          plan: card.plan,
          skillCardIds: [card.id, ...FILLER_CARD_IDS],
          customizations: [{ [id]: level }],
        });
      }
    }
  }
  assert.ok(cases.length > 0);
  assert.deepEqual(await collectWarnings(cases), []);
});
