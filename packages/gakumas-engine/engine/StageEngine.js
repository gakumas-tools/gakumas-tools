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
    state[S.stamina] = this.getConfig(state).idol.startStamina;
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

    // P-drinks
    state[S.pDrinks] = (this.getConfig(state).idol.pDrinkIds || []).map(
      (_, slot) => slot,
    );

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

  // P-drinks (produce exams). The drinks held going into the exam; each can
  // be drunk once, at any time during a turn, as in the game, where a drink
  // is tapped between card plays. Drinking applies the drink's actions
  // exactly as the fidelity harness's drinksBefore does
  // (effectManager.triggerEffects on the drink's actions). When to drink is
  // the strategy's choice (a decision { pDrink: index }, index into the
  // drinks still held). A drink may have a turn set for it (pDrinkTurns,
  // 1-based): the strategy then drinks it during that turn.
  getHeldPDrinks(state) {
    const { pDrinkIds } = this.getConfig(state).idol;
    return (state[S.pDrinks] || []).map((slot) => pDrinkIds[slot]);
  }

  // The turn set for a held drink (1-based), or null if it's the strategy's
  // to choose.
  getPDrinkTurn(state, index) {
    const slot = state[S.pDrinks][index];
    return this.getConfig(state).idol.pDrinkTurns?.[slot] || null;
  }

  canUsePDrink(state, index) {
    return (
      state[S.turnsRemaining] > 0 &&
      index >= 0 &&
      index < (state[S.pDrinks] || []).length
    );
  }

  usePDrink(prevState, index) {
    if (!this.canUsePDrink(prevState, index)) {
      throw new Error(`P-drink ${index} can't be drunk`);
    }
    const state = deepCopy(prevState);
    const pDrink = PDrinks.getById(this.getHeldPDrinks(state)[index]);
    state[S.pDrinks] = state[S.pDrinks].filter((_, i) => i != index);
    const source = { type: "pDrink", id: pDrink.id };
    this.logger.log(state, "entityStart", source);
    this.effectManager.triggerEffects(state, pDrink.actions);
    this.logger.log(state, "entityEnd", source);
    this.endIfPassed(state);
    return state;
  }

  isCardUsable(state, card) {
    return this.cardManager.isCardUsable(state, card);
  }

  executeDecision(state, decision) {
    if (decision.state) {
      return decision.state;
    } else if (decision.pDrink != null) {
      return this.usePDrink(state, decision.pDrink);
    } else if (decision.card !== null) {
      return this.useCard(state, decision.card);
    } else {
      return this.endTurn(state);
    }
  }

  useCard(prevState, card) {
    const state = deepCopy(prevState);
    this.cardManager.useCard(state, card);
    this.endIfPassed(state);
    return state;
  }

  endTurn(prevState) {
    const state = deepCopy(prevState);
    this.turnManager.endTurn(state);
    this.endIfPassed(state);
    return state;
  }

  // A produce exam ends as soon as the score reaches its 合格条件 score,
  // with the turns left unplayed.
  endIfPassed(state) {
    const { passScore } = this.getConfig(state).stage;
    if (passScore && state[S.score] >= passScore) {
      state[S.turnsRemaining] = 0;
    }
  }
}
