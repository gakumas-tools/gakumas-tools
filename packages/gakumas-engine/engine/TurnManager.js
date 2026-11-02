import {
  FULL_POWER_EFFECTS,
  FULL_POWER_CHANGED_EFFECTS,
  GOOD_IMPRESSION_EFFECTS,
  S,
} from "../constants";
import EngineComponent from "./EngineComponent";
import { getRand, shuffle } from "../utils";

export default class TurnManager extends EngineComponent {
  constructor(engine) {
    super(engine);

    this.variableResolvers = {
      isVocalTurn: (state) => this.getTurnType(state) == "vocal",
      isDanceTurn: (state) => this.getTurnType(state) == "dance",
      isVisualTurn: (state) => this.getTurnType(state) == "visual",
    };
  }

  initializeState(state) {
    state[S.turnsElapsed] = 0;
    state[S.turnsRemaining] = this.getConfig(state).stage.turnCount;
    state[S.turnTypes] = this.generateTurnTypes();
    state[S.linkPhase] = 0;
    state[S.unfreshPhase] = false;
  }

  getTurnType(state) {
    return state[S.turnTypes][
      Math.min(state[S.turnsElapsed], this.getConfig(state).stage.turnCount - 1)
    ];
  }

  getTurnMultiplier(state) {
    const turnType = this.getTurnType(state);
    return this.getConfig(state).typeMultipliers[turnType];
  }

  generateTurnTypes() {
    const { turnCounts, firstTurns, criteria } = this.engine.config.stage;

    // Initialize remaining counts for each turn type
    const remainingTurns = { ...turnCounts };

    // Pick first turn based on configured distribution
    const rand = getRand();
    let firstTurn = "vocal";
    if (rand > firstTurns.vocal) firstTurn = "dance";
    if (rand > firstTurns.vocal + firstTurns.dance) firstTurn = "visual";
    remainingTurns[firstTurn]--;

    // Pick last turns based on stage criteria, one of each type with turns left
    const sortedTypes = Object.keys(criteria).sort(
      (a, b) => criteria[b] - criteria[a]
    );
    const lastTurns = sortedTypes
      .slice()
      .reverse()
      .filter((type) => remainingTurns[type] > 0);
    lastTurns.forEach((t) => remainingTurns[t]--);

    let randomTurns = [];
    for (let k in remainingTurns) {
      for (let i = 0; i < remainingTurns[k]; i++) {
        randomTurns.push(k);
      }
    }
    shuffle(randomTurns);

    return [firstTurn, ...randomTurns, ...lastTurns];
  }

  startTurn(state, forceInitialHand = false) {
    this.logger.debug("Starting turn", state[S.turnsElapsed] + 1);

    this.logger.log(state, "startTurn", {
      num: state[S.turnsElapsed] + 1,
      type: this.getTurnType(state),
      multiplier: this.getTurnMultiplier(state),
    });

    state[S.cardUsesRemaining] = 1;
    state[S.unfreshPhase] = true;

    // "Next turn" reservations made while this turn starts belong to the next turn
    const effectsBeforeTurnStart = state[S.effects].length;

    state[S.prevStance] = "none";
    this.engine.effectManager.triggerEffects(state, FULL_POWER_EFFECTS);
    this.engine.effectManager.triggerEffectsForPhase(
      state,
      "beforeStartOfTurn"
    );
    this.engine.effectManager.triggerEffectsForPhase(state, "startOfTurn");

    // Draw cards
    for (let i = 0; i < 3; i++) {
      this.engine.cardManager.drawCard(state);
    }
    this.engine.effectManager.triggerEffects(state, FULL_POWER_CHANGED_EFFECTS);

    // Add forced initial hand cards
    if (state[S.turnsElapsed] == 0 || forceInitialHand) {
      for (let i = 0; i < 2; i++) {
        const card = this.engine.cardManager.peekDeck(state);
        if (
          card != null &&
          this.engine.cardManager.isForceInitialHand(state, card)
        ) {
          this.engine.cardManager.drawCard(state);
        }
      }
    }

    this.engine.effectManager.triggerEffectsForPhase(state, "afterStartOfTurn");
    this.engine.effectManager.triggerEffectsForPhase(
      state,
      "turn",
      null,
      effectsBeforeTurnStart
    );
    this.engine.effectManager.triggerEffectsForPhase(state, "everyTurn");
    state[S.unfreshPhase] = false;
  }

  endTurn(state) {
    // Recover stamina if turn ended by player
    if (state[S.cardUsesRemaining] > 0) {
      state[S.stamina] = Math.min(
        state[S.stamina] + 2,
        this.getConfig(state).idol.params.stamina
      );
      this.engine.effectManager.triggerEffectsForPhase(state, "turnSkipped");
    }

    // Trigger effects
    this.engine.effectManager.triggerEffectsForPhase(state, "endOfTurn");

    // Good impression
    const goodImpressionTurnsTimes = state[S.goodImpressionTurnsTimesBuffs].reduce(
      (acc, cur) => acc + cur.amount,
      1
    );
    for (let i = 0; i < goodImpressionTurnsTimes; i++) {
      this.engine.effectManager.triggerEffects(state, GOOD_IMPRESSION_EFFECTS);
    }

    // Decrement buff turns
    this.engine.buffManager.decrementBuffTurns(state);

    // Reset one turn fields
    state[S.cardUsesRemaining] = 0;
    state[S.turnCardsUsed] = 0;
    state[S.turnCardsUpgraded] = 0;
    if (state[S.enthusiasmExtensionTurns] > 0) {
      state[S.enthusiasmExtensionTurns]--;
    } else {
      state[S.enthusiasm] = 0;
    }

    this.engine.effectManager.decrementTtl(state);
    this.engine.effectManager.decrementDelay(state);
    this.engine.effectManager.clearExpiredEffects(state);

    // Discard hand
    this.engine.cardManager.discardHand(state);

    state[S.turnsElapsed]++;
    state[S.turnsRemaining]--;

    this.logger.pushGraphData(state);

    // Start next turn
    if (state[S.turnsRemaining] > 0) {
      let forceInitialHand = false;
      const stageConfig = this.getConfig(state).stage;
      if (stageConfig.type === "linkContest") {
        const { linkPhaseChangeTurns } = stageConfig;
        for (let i = 0; i < linkPhaseChangeTurns.length; i++) {
          if (
            state[S.turnsElapsed] == linkPhaseChangeTurns[i] &&
            i < this.engine.linkConfigs.length - 1
          ) {
            this.engine.changeIdol(state);
            forceInitialHand = true;
            break;
          }
        }
      }

      this.startTurn(state, forceInitialHand);
    }
  }
}
