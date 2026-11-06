import { G, GROWTH_FIELDS, S } from "../constants";
import { deepCopy } from "../utils";
import BaseStrategy from "./BaseStrategy";

const MAX_DEPTH = 3;

// Shared "sum amount × (turns || turnsRemaining)" for the buff-weighting
// used across getStateScore. A tight for-loop is notably faster than
// `Array.reduce` with an arrow closure in hot paths (dozens of calls per
// getStateScore, called thousands of times per run).
function sumBuffWeight(buffs, turnsRemaining) {
  let total = 0;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    total += b.amount * (b.turns || turnsRemaining);
  }
  return total;
}

const GROWTH_SCORE_MULTIPLIER_BY_INDEX = [];

const GROWTH_SCORE_MULTIPLIERS = {
  [G["g.score"]]: 2,
  [G["g.scoreTimes"]]: 20,
  [G["g.cost"]]: 1,
  [G["g.typedCost"]]: 1,
  [G["g.genki"]]: 1,
  [G["g.goodConditionTurns"]]: 1,
  [G["g.perfectConditionTurns"]]: 1,
  [G["g.concentration"]]: 2,
  [G["g.goodImpressionTurns"]]: 1,
  [G["g.motivation"]]: 1,
  [G["g.fullPowerCharge"]]: 1,
  [G["g.halfCostTurns"]]: 1,
  [G["g.scoreByGoodImpressionTurns"]]: 20,
  [G["g.scoreByMotivation"]]: 20,
  [G["g.scoreByGenki"]]: 20,
  [G["g.stanceLevel"]]: 2,
};
for (let k = 0; k < GROWTH_FIELDS.length; k++) {
  GROWTH_SCORE_MULTIPLIER_BY_INDEX[k] = GROWTH_SCORE_MULTIPLIERS[k] || 1;
}

export default class HeuristicStrategy extends BaseStrategy {
  constructor(engine) {
    super(engine);

    this.depth = 0;
    this.rootEffectCount = 0;
    // Per-linkPhase cache of config-derived scoring constants so
    // getStateScore doesn't rebuild them on every call (it fires several
    // times per useCard speculation, thousands of times per run).
    this._configCache = new Map();
  }

  _getScoringConfig(state) {
    const linkPhase = state[S.linkPhase] || 0;
    let cache = this._configCache.get(linkPhase);
    if (cache) return cache;

    const config = this.engine.getConfig(state);
    const { recommendedEffect, pIdolId, plan } = config.idol;

    let goodConditionTurnsMultiplier =
      recommendedEffect == "goodConditionTurns" ? 1.75 : 1;
    if (pIdolId == 114) goodConditionTurnsMultiplier = 8;

    // Average type multiplier: weighted by each turn type's share of the
    // stage's turn count. Pure function of config.
    const { typeMultipliers, stage } = config;
    let averageTypeMultiplier = 0;
    for (const type in typeMultipliers) {
      averageTypeMultiplier +=
        (typeMultipliers[type] * stage.turnCounts[type]) / stage.turnCount;
    }

    cache = {
      config,
      recommendedEffect,
      pIdolId,
      plan,
      goodConditionTurnsMultiplier,
      concentrationMultiplier: recommendedEffect == "concentration" ? 3 : 1,
      goodImpressionTurnsMultiplier:
        recommendedEffect == "goodImpressionTurns" ? 3.5 : 1,
      motivationMultiplier: recommendedEffect == "motivation" ? 5.5 : 1,
      fullPowerMultiplier: recommendedEffect == "fullPower" ? 5 : 1,
      averageTypeMultiplier,
    };
    this._configCache.set(linkPhase, cache);
    return cache;
  }

  evaluate(state) {
    if (this.depth == 0) {
      this.rootEffectCount = state[S.effects].length;
    }

    const handLog = this.engine.logger.log(state, "hand", null);

    const futures = state[S.handCards].map((card) =>
      this.getFuture(state, card)
    );

    let nextState;

    const scores = futures.map((f) => (f ? f.score : -Infinity));
    let maxScore = Math.max(...scores);
    let selectedIndex = null;
    if (maxScore > 0) {
      selectedIndex = scores.indexOf(maxScore);
      nextState = futures[selectedIndex].state;
    } else {
      nextState = this.engine.endTurn(state);
      maxScore = this.getStateScore(nextState);
    }

    handLog.data = {
      handCards: state[S.handCards].map((card) => ({
        id: state[S.cardMap][card].id,
        c: state[S.cardMap][card].c11n,
      })),
      scores,
      selectedIndex,
      state: this.engine.logger.getHandStateForLogging(state),
    };

    return { score: maxScore, state: nextState };
  }

  getFuture(state, card) {
    if (!this.engine.isCardUsable(state, card)) {
      return null;
    }

    const previewState = this.engine.useCard(state, card);
    this.depth++;

    // Additional actions
    if (
      previewState[S.turnsRemaining] >= state[S.turnsRemaining] &&
      this.depth < MAX_DEPTH
    ) {
      const future = this.evaluate(previewState);
      this.depth--;
      return { score: future.score, state: future.state };
    }

    let score = 0;
    const previewScore = this.getStateScore(previewState);

    // Effects -- TODO: make this not suck
    const effectsDiff = previewState[S.effects].length - this.rootEffectCount;
    for (let i = 0; i < effectsDiff; i++) {
      const effect =
        previewState[S.effects][previewState[S.effects].length - i - 1];
      let limit = previewState[S.turnsRemaining];
      if (
        effect.limit != null &&
        effect.limit < previewState[S.turnsRemaining]
      ) {
        limit = effect.limit + 1;
      }
      if (limit == 0) continue;
      const postEffectState = deepCopy(previewState);
      this.engine.effectManager.triggerEffects(
        postEffectState,
        [
          {
            ...effect,
            phase: null,
            delay: effect.delay - previewState[S.turnsRemaining],
          },
        ],
        null,
        null,
        true
      );
      const scoreDelta = this.getStateScore(postEffectState) - previewScore;
      score += 3 * scoreDelta * Math.min(limit, 6);
    }

    if (this.engine.getConfig(state).idol.plan != "anomaly") {
      // Cards removed
      score +=
        (((state[S.removedCards].length - previewState[S.removedCards].length) *
          (previewState[S.score] - state[S.score])) /
          this.getAverageTypeMultiplier(state)) *
        Math.floor(previewState[S.turnsRemaining] / 13);
    }

    score += previewScore;

    this.depth--;
    return { score: Math.round(score), state: previewState };
  }

  getAverageTypeMultiplier(state) {
    return this._getScoringConfig(state).averageTypeMultiplier;
  }

  scaleScore(score, state) {
    return Math.ceil(score * this.getAverageTypeMultiplier(state));
  }

  getStateScore(state) {
    // After the last turn, resources and card plays are worth nothing.
    if (state[S.turnsRemaining] == 0) return state[S.score];

    const sc = this._getScoringConfig(state);
    // Mirror multipliers on `this` so call-sites that read them (including
    // `getFuture`'s scoring adjustments) keep working unchanged.
    this.goodConditionTurnsMultiplier = sc.goodConditionTurnsMultiplier;
    this.concentrationMultiplier = sc.concentrationMultiplier;
    this.goodImpressionTurnsMultiplier = sc.goodImpressionTurnsMultiplier;
    this.motivationMultiplier = sc.motivationMultiplier;
    this.fullPowerMultiplier = sc.fullPowerMultiplier;

    const turnsRemaining = state[S.turnsRemaining];
    const goodConditionTurns = state[S.goodConditionTurns];

    // Calc score

    let score = 0;

    // Cards in hand
    score += state[S.handCards].length * 3;

    // Cards used
    score += state[S.cardsUsed] * 8;

    // Stamina
    score += state[S.stamina] * turnsRemaining * 0.05;

    // Genki
    score +=
      state[S.genki] *
      Math.tanh(turnsRemaining / 3) *
      0.7 *
      sc.motivationMultiplier;

    // Good condition turns
    if (sc.pIdolId == 114) {
      if (turnsRemaining > 0) {
        score += goodConditionTurns * 3 * sc.goodConditionTurnsMultiplier;
      }
    } else {
      score +=
        Math.min(goodConditionTurns, turnsRemaining) *
        1.6 *
        sc.goodConditionTurnsMultiplier;
    }

    // Perfect condition turns
    score +=
      Math.min(state[S.perfectConditionTurns], turnsRemaining) *
      goodConditionTurns *
      sc.goodConditionTurnsMultiplier *
      1.5;

    // Concentration
    score +=
      state[S.concentration] * turnsRemaining * sc.concentrationMultiplier;

    // Stance
    if (
      sc.plan == "anomaly" &&
      (turnsRemaining || state[S.cardUsesRemaining])
    ) {
      score += state[S.strengthTimes] * 40;
      score += state[S.preservationTimes] * 80;
      score += state[S.leisureTimes] * 80;
      score += state[S.fullPowerTimes] * 80 * sc.fullPowerMultiplier;

      //Enthusiasm
      score += state[S.enthusiasm] * 5;
      score +=
        state[S.enthusiasm] *
        Math.min(state[S.enthusiasmExtensionTurns], turnsRemaining) *
        5;

      // Full power charge
      score +=
        state[S.cumulativeFullPowerCharge] * 3 * sc.fullPowerMultiplier;

      // Enthusiasm buffs
      score += sumBuffWeight(state[S.enthusiasmBuffs], turnsRemaining) * 5;

      // Full power charge buffs
      score +=
        sumBuffWeight(state[S.fullPowerChargeBuffs], turnsRemaining) *
        sc.fullPowerMultiplier;

      // Full power effect buffs
      score +=
        sumBuffWeight(state[S.fullPowerEffectBuffs], turnsRemaining) *
        sc.fullPowerMultiplier;

      // Strength effect buffs
      score += sumBuffWeight(state[S.strengthEffectBuffs], turnsRemaining);

      // Growth
      score += this.getGrowthScore(state) * 0.2 * turnsRemaining;
    }

    // Good impression turns
    score +=
      state[S.goodImpressionTurns] *
      turnsRemaining *
      sc.goodImpressionTurnsMultiplier;

    // Motivation
    score +=
      state[S.motivation] * turnsRemaining * 0.45 * sc.motivationMultiplier;

    // Pride turns
    score += state[S.prideTurns] * turnsRemaining * 0.2;

    // Score buffs
    score += sumBuffWeight(state[S.scoreBuffs], turnsRemaining) * 8;

    // Half cost turns
    score += Math.min(state[S.halfCostTurns], turnsRemaining) * 6;

    // Double cost turns
    score += Math.min(state[S.doubleCostTurns], turnsRemaining) * -6;

    // Double buff cost turns
    score += Math.min(state[S.doubleBuffCostTurns], turnsRemaining) * -6;

    // Cost reduction
    score += state[S.costReduction] * turnsRemaining * 0.5;

    // Double card effect cards
    score += state[S.doubleCardEffectCards] * 50;

    // Card uses remaining
    score += state[S.cardUsesRemaining] * 50;

    // Good impression turns buffs
    score +=
      sumBuffWeight(state[S.goodImpressionTurnsBuffs], turnsRemaining) *
      10 *
      sc.goodImpressionTurnsMultiplier;

    // Good impression turns effects buffs
    score +=
      sumBuffWeight(state[S.goodImpressionTurnsEffectBuffs], turnsRemaining) *
      state[S.goodImpressionTurns] *
      sc.goodImpressionTurnsMultiplier;

    // Good impression turns times buffs
    score +=
      sumBuffWeight(state[S.goodImpressionTurnsTimesBuffs], turnsRemaining) *
      state[S.goodImpressionTurns] *
      sc.goodImpressionTurnsMultiplier;

    // Good condition turns buffs
    score +=
      sumBuffWeight(state[S.goodConditionTurnsBuffs], turnsRemaining) *
      sc.goodConditionTurnsMultiplier;

    // Good condition turns addition buffs
    score +=
      sumBuffWeight(state[S.goodConditionTurnsAdditionBuffs], turnsRemaining) *
      sc.goodConditionTurnsMultiplier;

    // Motivation buffs
    score +=
      sumBuffWeight(state[S.motivationBuffs], turnsRemaining) *
      sc.motivationMultiplier;

    // Motivation addition buffs
    score +=
      sumBuffWeight(state[S.motivationAdditionBuffs], turnsRemaining) *
      sc.motivationMultiplier;

    // Concentration buffs
    score +=
      sumBuffWeight(state[S.concentrationBuffs], turnsRemaining) *
      sc.concentrationMultiplier;

    // Concentration addition buffs
    score +=
      sumBuffWeight(state[S.concentrationAdditionBuffs], turnsRemaining) *
      sc.concentrationMultiplier;

    // Nullify genki turns
    score += state[S.nullifyGenkiTurns] * -9;

    // Turn cards upgraded
    score += state[S.turnCardsUpgraded] * 20;

    // Scale score
    score = Math.ceil(score * sc.averageTypeMultiplier);

    const recommendedEffect = sc.recommendedEffect;
    if (recommendedEffect == "goodConditionTurns") {
      score += state[S.score] * 0.4;
    } else if (recommendedEffect == "concentration") {
      score += state[S.score] * 0.6;
    } else if (recommendedEffect == "goodImpressionTurns") {
      score += state[S.score] * 1.1;
    } else if (recommendedEffect == "motivation") {
      score += state[S.score] * 0.6;
    } else if (recommendedEffect == "strength") {
      score += state[S.score] * 0.65;
    } else if (recommendedEffect == "preservation") {
      score += state[S.score] * 0.65;
    } else if (recommendedEffect == "fullPower") {
      score += state[S.score] * 0.8;
    } else {
      score += state[S.score];
    }

    return Math.round(score);
  }

  getGrowthScore(state) {
    let growthScore = 0;
    const cardMap = state[S.cardMap];
    for (let i = 0; i < cardMap.length; i++) {
      const growth = cardMap[i].growth;
      if (!growth) continue;
      for (let k = 0; k < GROWTH_FIELDS.length; k++) {
        const value = growth[k];
        if (value !== undefined) {
          growthScore += value * GROWTH_SCORE_MULTIPLIER_BY_INDEX[k];
        }
      }
    }
    return growthScore;
  }

  evaluateForHold(state, card) {
    let previewState = this.engine.getInitialState(true);
    previewState[S.cardMap] = state[S.cardMap].slice();
    this.engine.buffManager.setStance(previewState, "fullPower");
    previewState[S.nullifySelect] = 1;
    previewState = this.engine.useCard(previewState, card);
    return Math.round(previewState[S.score]);
  }

  pickCardsToHold(state, cards, num = 1, optional = false) {
    // When optional, compare candidates against currently-held cards —
    // only hold a candidate if it beats one of the top-2 held slots.
    const evalCards = optional ? cards.concat(state[S.heldCards]) : cards;
    const scores = evalCards.map((c) => this.evaluateForHold(state, c));
    return scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((item) => item.index)
      .filter((index) => index < cards.length)
      .slice(0, num);
  }

  pickCardsToMoveToHand(state, cards, num = 1) {
    return this.pickCardsToHold(state, cards, num);
  }

  pickCardsToMoveToTopOfDeck(state, cards, num = 1) {
    return this.pickCardsToHold(state, cards, num);
  }

  // evaluateForHold scores a card in a fresh full-power state, but the
  // selected use plays it in the real one, where a card whose conditions
  // fail does nothing (and a paid use discards it). Pick among the cards
  // whose conditions pass, if any do.
  pickCardsToUseFree(state, cards, num = 1) {
    const playable = [];
    for (let i = 0; i < cards.length; i++) {
      const conditions = this.engine.cardManager.getConditions(state, cards[i]);
      if (
        conditions.every((condition) =>
          this.engine.evaluator.evaluateCondition(state, condition),
        )
      ) {
        playable.push(i);
      }
    }
    if (!playable.length) return this.pickCardsToHold(state, cards, num);
    return this.pickCardsToHold(
      state,
      playable.map((i) => cards[i]),
      num,
    ).map((j) => playable[j]);
  }
}
