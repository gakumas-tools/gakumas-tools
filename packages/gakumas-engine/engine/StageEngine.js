import { PDrinks } from "gakumas-data";
import { ALL_FIELDS, S } from "../constants";
import BuffManager from "./BuffManager";
import CardManager from "./CardManager";
import EffectManager from "./EffectManager";
import Evaluator from "./Evaluator";
import Executor from "./Executor";
import StageLogger from "./StageLogger";
import TurnManager from "./TurnManager";
import { deepCopy } from "../utils";

export default class StageEngine {
  constructor(config, linkConfigs) {
    this.config = config;
    this.linkConfigs = linkConfigs;
    this.logger = new StageLogger(this);
    this.cardManager = new CardManager(this);
    this.effectManager = new EffectManager(this);
    this.buffManager = new BuffManager(this);
    this.turnManager = new TurnManager(this);
    this.evaluator = new Evaluator(this);
    this.executor = new Executor(this);
  }

  getConfig(state) {
    if (this.config.stage.type === "linkContest") {
      return this.linkConfigs[state[S.linkPhase] || 0];
    }
    return this.config;
  }

  getInitialState(skipEffects = false) {
    // Every slot is present so the array stays packed (no holes).
    const state = [];
    for (let i = 0; i < ALL_FIELDS.length; i++) state.push(undefined);

    // Logs
    this.logger.initializeState(state);

    // General
    state[S.cardUsesRemaining] = 0;
    state[S.stamina] = this.getConfig(state).idol.params.stamina;
    state[S.consumedStamina] = 0;
    state[S.genki] = 0;
    state[S.consumedGenki] = 0;
    state[S.consumedGoodImpressionTurns] = 0;
    state[S.score] = 0;

    // Turns
    this.turnManager.initializeState(state);

    // Buffs
    this.buffManager.initializeState(state);

    // Skill cards
    this.cardManager.initializeState(state);

    // Effects
    if (skipEffects) {
      // evaluateForHold path: skip pre-stage effect registration (default
      // effects, stage effects, p-items, growth) but still initialize the
      // skeleton fields — otherwise any card that writes to effectCounter
      // during the hold preview crashes on undefined `state[S.effectCounters]`.
      state[S.effects] = [];
      state[S.effectInstanceId] = 0;
      state[S.effectCounters] = {};
      state[S.currentEffectInstanceId] = null;
    } else {
      this.effectManager.initializeState(state);
    }

    return state;
  }

  changeIdol(state) {
    state[S.linkPhase] += 1;
    state[S.stamina] = this.getConfig(state).idol.params.stamina;
    this.cardManager.changeIdol(state);
    this.logger.log(state, "linkPhaseChange", { phase: state[S.linkPhase] });
  }

  startStage(state) {
    this.logger.disable();
    this.effectManager.triggerEffectsForPhase(state, "prestage");
    this.effectManager.clearPrestageEffects(state);
    this.logger.enable();
    this.effectManager.triggerEffectsForPhase(state, "startOfStage");
    this.effectManager.triggerEffectsForPhase(state, "afterStartOfStage");
    this.logger.pushGraphData(state);
    this.turnManager.startTurn(state);
    return state;
  }

  // P-drinks (produce exams), called by TurnManager at the end of each
  // turn's start (the hand is already drawn). Each held drink is drunk once,
  // at the start of the turn set for it (default turn 1), in slot order.
  // SIMPLIFICATION: in the game a drink can be drunk at any time during a
  // turn, not only before the turn's first card. Each drink applies its
  // actions exactly as the fidelity harness's drinksBefore does
  // (effectManager.triggerEffects on the drink's actions).
  drinkPDrinks(state) {
    const { pDrinkIds = [], pDrinkTurns = [] } =
      this.getConfig(state).idol || {};
    const turn = state[S.turnsElapsed] + 1;
    for (let i = 0; i < pDrinkIds.length; i++) {
      if ((pDrinkTurns[i] || 1) != turn) continue;
      const pDrink = PDrinks.getById(pDrinkIds[i]);
      if (!pDrink) continue;
      const source = { type: "pDrink", id: pDrink.id };
      this.logger.log(state, "entityStart", source);
      this.effectManager.triggerEffects(state, pDrink.actions);
      this.logger.log(state, "entityEnd", source);
    }
  }

  isCardUsable(state, card) {
    return this.cardManager.isCardUsable(state, card);
  }

  executeDecision(state, decision) {
    if (decision.state) {
      return decision.state;
    } else if (decision.card !== null) {
      return this.useCard(state, decision.card);
    } else {
      return this.endTurn(state);
    }
  }

  useCard(prevState, card) {
    const state = deepCopy(prevState);
    this.cardManager.useCard(state, card);
    return state;
  }

  endTurn(prevState) {
    const state = deepCopy(prevState);
    this.turnManager.endTurn(state);
    return state;
  }
}
