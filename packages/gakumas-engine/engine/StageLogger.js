import { DEBUG, GRAPHED_FIELDS, LOGGED_FIELDS, S } from "../constants";

const LOGGED_BUFFS_FIELDS = [
  S.scoreBuffs,
  S.scoreDebuffs,
  S.goodImpressionTurnsBuffs,
  S.goodImpressionTurnsEffectBuffs,
  S.goodImpressionTurnsTimesBuffs,
  S.motivationBuffs,
  S.motivationAdditionBuffs,
  S.goodConditionTurnsBuffs,
  S.goodConditionTurnsAdditionBuffs,
  S.concentrationBuffs,
  S.concentrationAdditionBuffs,
  S.concentrationEffectBuffs,
  S.enthusiasmBuffs,
  S.enthusiasmBonusBuffs,
  S.fullPowerChargeBuffs,
  S.fullPowerEffectBuffs,
  S.strengthEffectBuffs,
];

const HAND_STATE_FIELDS = LOGGED_FIELDS.filter(
  (field) => field != S.turnsRemaining && field != S.cardUsesRemaining,
);

export default class StageLogger {
  constructor(engine) {
    this.engine = engine;
    this.reset();
  }

  initializeState(state) {
    // Persistent list of { entry, prev } nodes, newest first, so copies of a
    // state share their log history.
    state[S.logs] = null;
    // Persistent list of { values, prev } snapshots, newest first.
    state[S.graphData] = null;
  }

  reset() {
    this.disabled = false;
  }

  disable() {
    this.disabled = true;
  }

  enable() {
    this.disabled = false;
  }

  getLogs(state) {
    const logs = [];
    for (let node = state[S.logs]; node; node = node.prev) {
      logs.push(node.entry);
    }
    return logs.reverse();
  }

  log(state, logType, data) {
    if (this.disabled) return;
    const entry = { logType, data };
    state[S.logs] = { entry, prev: state[S.logs] };
    return entry;
  }

  debug(...args) {
    if (!DEBUG || this.disabled) return;
    console.log(...args);
  }

  pushGraphData(state) {
    if (this.disabled) return;
    const values = new Array(GRAPHED_FIELDS.length);
    for (let i = 0; i < GRAPHED_FIELDS.length; i++) {
      values[i] = state[GRAPHED_FIELDS[i]];
    }
    state[S.graphData] = { values, prev: state[S.graphData] };
  }

  getGraphData(state) {
    const snapshots = [];
    for (let node = state[S.graphData]; node; node = node.prev) {
      snapshots.push(node.values);
    }
    snapshots.reverse();
    const graphData = {};
    for (let i = 0; i < GRAPHED_FIELDS.length; i++) {
      graphData[GRAPHED_FIELDS[i]] = snapshots.map((values) => values[i]);
    }
    return graphData;
  }

  getHandStateForLogging(state) {
    let res = {};
    for (let i = 0; i < HAND_STATE_FIELDS.length; i++) {
      const field = HAND_STATE_FIELDS[i];
      if (state[field]) {
        res[field] = state[field];
      }
    }

    for (let field of LOGGED_BUFFS_FIELDS) {
      if (state[field]?.length) {
        // Shallow-slice suffices: buffs are treated as immutable (all
        // mutations go through BuffManager which replaces entries
        // rather than mutating them).
        res[field] = state[field].slice();
      }
    }

    res.turn = {
      types: state[S.turnTypes],
      elapsed: state[S.turnsElapsed],
      remaining: state[S.turnsRemaining],
      multiplier: this.engine.turnManager.getTurnMultiplier(state),
    };

    return res;
  }
}
