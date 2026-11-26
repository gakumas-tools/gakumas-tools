import { test } from "node:test";
import assert from "node:assert/strict";
import { PDrinks } from "gakumas-data";
import { resetRand, S } from "gakumas-engine";
import { createEngine } from "../helpers.mjs";

const UNMEI_NO_DEAI_PLUS = 247;

test("next-turn reservations made at turn start fire on the next turn", () => {
  const engine = createEngine({
    params: [2000, 2700, 800, 50],
    pItemIds: [UNMEI_NO_DEAI_PLUS],
    skillCardIds: [527],
    stageId: 189,
  });
  let state = engine.startStage(engine.getInitialState());
  assert.equal(state[S.stance], "none");

  state[S.fullPowerCharge] = 10;
  state = engine.endTurn(state);
  assert.equal(state[S.stance], "fullPower");

  state = engine.endTurn(state);
  assert.equal(state[S.stance], "preservation");
});

// P-drinks: the engine's drink path must apply exactly what the fidelity
// harness's drinksBefore applies (tests/trainingFidelity.mjs), so produce-exam
// sims and captured replays agree on what a drink does.
const DRINKS = [5, 11, 18]; // ルイボスティー, フレッシュビネガー, 初星ホエイプロテイン

function stripLogs(state) {
  const copy = [...state];
  copy[S.logs] = null;
  copy[S.graphData] = null;
  return copy;
}

test("held P-drinks wait for the strategy: none is drunk on its own", () => {
  const engine = createEngine({ skillCardIds: [1, 3, 5, 13, 43, 45], pDrinkIds: DRINKS });
  let state = engine.startStage(engine.getInitialState());
  assert.deepEqual(engine.getHeldPDrinks(state), DRINKS);
  assert.equal(state[S.goodImpressionTurns], 0);
  state = engine.endTurn(state);
  assert.deepEqual(engine.getHeldPDrinks(state), DRINKS);
});

test("a P-drink drunk at a turn's start applies what the harness's drinksBefore applies", () => {
  const deck = [1, 3, 5, 13, 43, 45];
  resetRand(7);
  const drinker = createEngine({ skillCardIds: deck, pDrinkIds: DRINKS });
  let drunk = drinker.startStage(drinker.getInitialState());
  for (let i = 0; i < DRINKS.length; i++) drunk = drinker.usePDrink(drunk, 0);

  resetRand(7);
  const plain = createEngine({ skillCardIds: deck });
  const harness = plain.startStage(plain.getInitialState());
  for (const id of DRINKS) {
    plain.effectManager.triggerEffects(harness, PDrinks.getById(id).actions);
  }
  harness[S.pDrinks] = [];

  assert.deepEqual(stripLogs(drunk), stripLogs(harness));
  // And the drinks did something: 好印象 3, +3 固定元気, one more card use.
  assert.equal(drunk[S.goodImpressionTurns], 3);
  assert.ok(drunk[S.cardUsesRemaining] >= 2);
});

test("a P-drink can be drunk between card plays, and only once", () => {
  const deck = [1, 3, 5, 13, 43, 45];
  resetRand(11);
  const drinker = createEngine({ skillCardIds: deck, pDrinkIds: [18, 5] });
  let drunk = drinker.startStage(drinker.getInitialState());
  drunk = drinker.usePDrink(drunk, 0); // 初星ホエイプロテイン: one more card use
  const card = drunk[S.handCards].find((c) => drinker.isCardUsable(drunk, c));
  drunk = drinker.useCard(drunk, card);
  assert.equal(drunk[S.turnsElapsed], 0, "the extra use keeps the turn going");
  drunk = drinker.executeDecision(drunk, { pDrink: 0 }); // ルイボスティー, mid-turn

  resetRand(11);
  const plain = createEngine({ skillCardIds: deck });
  let harness = plain.startStage(plain.getInitialState());
  plain.effectManager.triggerEffects(harness, PDrinks.getById(18).actions);
  harness = plain.useCard(harness, card);
  plain.effectManager.triggerEffects(harness, PDrinks.getById(5).actions);
  harness[S.pDrinks] = [];

  assert.deepEqual(stripLogs(drunk), stripLogs(harness));
  assert.equal(drinker.canUsePDrink(drunk, 0), false);
  assert.throws(() => drinker.usePDrink(drunk, 0));
});

test("P-drinks: the same drink may be held twice, and drinking one keeps the other", () => {
  const engine = createEngine({ pDrinkIds: [5, 5] });
  let state = engine.startStage(engine.getInitialState());
  state = engine.usePDrink(state, 1);
  assert.deepEqual(engine.getHeldPDrinks(state), [5]);
  assert.equal(state[S.goodImpressionTurns], 3);
});

test("P-drinks: unknown ids are dropped and at most 3 are held", () => {
  const engine = createEngine({ pDrinkIds: [5, 0, 99999, 11, 18, 5] });
  assert.deepEqual(engine.config.idol.pDrinkIds, [5, 11, 18]);
});

test("a P-drink set for a turn is drunk in that turn, and not before", async () => {
  const { STRATEGIES, StagePlayer } = await import("gakumas-engine");
  resetRand(3);
  const engine = createEngine({
    params: [1000, 1000, 1000, 50],
    skillCardIds: [1, 3, 5, 13, 43, 45],
    pDrinkIds: [1, 5],
    pDrinkTurns: [3, null],
  });
  engine.logger.enable();
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const { logs } = await new StagePlayer(engine, strategy).play();
  let turn = 0;
  const drunk = {};
  for (const log of logs) {
    if (log.logType == "startTurn") turn++;
    if (log.logType == "entityStart" && log.data.type == "pDrink")
      drunk[log.data.id] = turn;
  }
  assert.equal(drunk[1], 3, "初星水 in turn 3");
  assert.ok(drunk[5] >= 1, "ルイボスティー when the strategy chose");
});

test("P-drink turns: unset is null (the strategy's), and they stay with their drink", () => {
  const engine = createEngine({
    pDrinkIds: [5, 99999, 11, 18],
    pDrinkTurns: [4, 2, undefined, 0],
  });
  assert.deepEqual(engine.config.idol.pDrinkIds, [5, 11, 18]);
  assert.deepEqual(engine.config.idol.pDrinkTurns, [4, null, null]);
});

test("planning a drink's turn picks one, keeps set turns and leaves the config as it was", async () => {
  const { STRATEGIES, planPDrinkTurns } = await import("gakumas-engine");
  resetRand(5);
  const engine = createEngine({
    params: [1000, 1000, 1000, 50],
    skillCardIds: [1, 3, 5, 13, 43, 45],
    pDrinkIds: [1, 5],
    pDrinkTurns: [2, null],
  });
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const plan = await planPDrinkTurns(engine, strategy, { runsPerOption: 2 });
  assert.equal(plan.length, 2);
  assert.equal(plan[0], 2);
  assert.ok(plan[1] == null || (plan[1] >= 1 && plan[1] <= engine.config.stage.turnCount));
  assert.deepEqual(engine.config.idol.pDrinkTurns, [2, null]);
});

test("planning drinks gives the same plan when the options are scored on separate engines", async () => {
  const { STRATEGIES, planPDrinkTurns, scorePDrinkTurns } = await import(
    "gakumas-engine"
  );
  const loadout = {
    params: [1000, 1000, 1000, 50],
    skillCardIds: [1, 3, 5, 13, 43, 45],
    pDrinkIds: [1, 5],
  };
  const withStrategy = () => {
    const engine = createEngine(loadout);
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;
    return { engine, strategy };
  };
  const here = withStrategy();
  resetRand(7);
  const plan = await planPDrinkTurns(here.engine, here.strategy, {
    runsPerOption: 2,
  });

  // As the simulator does it: each worker scores a share of the options.
  const workers = [withStrategy(), withStrategy()];
  resetRand(7);
  const split = await planPDrinkTurns(withStrategy().engine, null, {
    scoreOptions: async (options, seed) => {
      const half = Math.ceil(options.length / 2);
      const shares = [options.slice(0, half), options.slice(half)];
      // One after the other: workers don't share the random numbers.
      const scores = [];
      for (const [i, share] of shares.entries()) {
        const { engine, strategy } = workers[i];
        scores.push(
          ...(await scorePDrinkTurns(engine, strategy, share, {
            seed,
            runsPerOption: 2,
          })),
        );
      }
      return scores;
    },
  });
  assert.deepEqual(split, plan);
});
