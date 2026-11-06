import { S } from "../constants";
import HeuristicStrategy from "./HeuristicStrategy";

export const DEFAULT_WEIGHTS = {
  buff: 1,
  score: 1,
  stamina: 1,
  hand: 1,
  cardsUsed: 1,
};

const BUFF_MULTIPLIERS = [
  "goodConditionTurnsMultiplier",
  "concentrationMultiplier",
  "goodImpressionTurnsMultiplier",
  "motivationMultiplier",
  "fullPowerMultiplier",
];

// How much of the current score HeuristicStrategy counts, by recommended effect.
const SCORE_SHARES = {
  goodConditionTurns: 0.4,
  concentration: 0.6,
  goodImpressionTurns: 1.1,
  motivation: 0.6,
  strength: 0.65,
  preservation: 0.65,
  fullPower: 0.8,
};

// HeuristicStrategy with its buff, score, stamina, hand and cards used terms
// scaled, for offline studies. It isn't in STRATEGIES.
export default class WeightedHeuristicStrategy extends HeuristicStrategy {
  constructor(engine, weights = {}) {
    super(engine);
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.weightedConfigs = new Map();
  }

  _getScoringConfig(state) {
    const linkPhase = state[S.linkPhase] || 0;
    let config = this.weightedConfigs.get(linkPhase);
    if (config) return config;

    config = { ...super._getScoringConfig(state) };
    for (const key of BUFF_MULTIPLIERS) {
      config[key] *= this.weights.buff;
    }
    this.weightedConfigs.set(linkPhase, config);
    return config;
  }

  getStateScore(state) {
    const score = super.getStateScore(state);
    if (state[S.turnsRemaining] == 0) return score;

    const { averageTypeMultiplier, recommendedEffect } =
      this._getScoringConfig(state);
    const { score: scoreWeight, stamina, hand, cardsUsed } = this.weights;

    const resources =
      (hand - 1) * state[S.handCards].length * 3 +
      (cardsUsed - 1) * state[S.cardsUsed] * 8 +
      (stamina - 1) * state[S.stamina] * state[S.turnsRemaining] * 0.05;
    const stageScore =
      (scoreWeight - 1) * state[S.score] * (SCORE_SHARES[recommendedEffect] ?? 1);

    return Math.round(score + resources * averageTypeMultiplier + stageScore);
  }
}
