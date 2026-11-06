import {
  BUFF_FIELDS,
  CHANGE_TRIGGER_PHASES,
  DEBUFF_FIELDS,
  DEBUFF_SPECIAL_ACTIONS,
  DECREASE_TRIGGER_FIELDS,
  EOT_DECREMENT_FIELDS,
  G,
  GROWABLE_FIELDS,
  INCREASE_TRIGGER_FIELDS,
  LOGGED_FIELDS,
  NON_NEGATIVE_FIELDS,
  S,
  WHOLE_FIELDS,
  ALL_FIELDS,
} from "../../constants";
import EngineComponent from "../EngineComponent";
import { formatDiffField } from "../../utils";
import * as resolvers from "./resolvers";

// Precomputed delta-field indices and phase strings for the change-trigger
// fields, so `triggerChangeEffects` can index by position instead of
// rebuilding `${fieldName}Delta` / `${fieldName}Increased` strings on each
// iteration.
const INCREASE_DELTA_FIELDS = INCREASE_TRIGGER_FIELDS.map(
  (f) => S[`${ALL_FIELDS[f]}Delta`],
);
const INCREASE_PHASES = INCREASE_TRIGGER_FIELDS.map(
  (f) => `${ALL_FIELDS[f]}Increased`,
);
const DECREASE_DELTA_FIELDS = DECREASE_TRIGGER_FIELDS.map(
  (f) => S[`${ALL_FIELDS[f]}Delta`],
);
const DECREASE_PHASES = DECREASE_TRIGGER_FIELDS.map(
  (f) => `${ALL_FIELDS[f]}Decreased`,
);

// Fields triggerChangeEffects compares against their pre-action values.
const CHANGE_WATCH_FIELDS = [
  ...new Set([
    ...BUFF_FIELDS,
    ...INCREASE_TRIGGER_FIELDS,
    ...DECREASE_TRIGGER_FIELDS,
  ]),
];
const watchIndex = (f) => CHANGE_WATCH_FIELDS.indexOf(f);
const BUFF_WATCH = BUFF_FIELDS.map(watchIndex);
const INCREASE_WATCH = INCREASE_TRIGGER_FIELDS.map(watchIndex);
const DECREASE_WATCH = DECREASE_TRIGGER_FIELDS.map(watchIndex);

function snapshotWatchedFields(state) {
  const snap = new Array(CHANGE_WATCH_FIELDS.length);
  for (let i = 0; i < CHANGE_WATCH_FIELDS.length; i++) {
    snap[i] = state[CHANGE_WATCH_FIELDS[i]];
  }
  return snap;
}

const ALWAYS_INTERMEDIATE = new Set(["cost", "fixedGenki", "fixedStamina"]);
const INTERMEDIATE_ON_ADD = new Set([
  "score",
  "goodImpressionTurns",
  "motivation",
  "goodConditionTurns",
  "concentration",
  "enthusiasm",
  "fullPowerCharge",
  "genki",
]);
const GROWTH_INDEX_BY_FIELD = new Map(
  ALL_FIELDS.map((name) => [name, G[`g.${name}`]]),
);

export default class Executor extends EngineComponent {
  constructor(engine) {
    super(engine);

    // Stack of {state, snap} frames — one per active executeActions call —
    // used for per-action diff logging (see executeActions/logDiffs).
    // Frames carry the state they were captured from because nested
    // executions don't always share it: strategy hooks (pickCardsToHold /
    // pickCardsToUseFree) simulate candidate cards on fresh preview states
    // in the middle of a real action, and their diffs must never patch the
    // real run's baselines. Frame objects are pooled by depth — push/pop
    // is strictly LIFO.
    this.diffSnapshots = [];
    this.snapshotPool = [];

    this.specialActions = {
      ...this.engine.cardManager.specialActions,
      ...this.engine.buffManager.specialActions,
    };

    this.intermediateResolvers = {
      cost: (state, value, growth) =>
        resolvers.resolveCost(state, value, growth),
      fixedGenki: (state, value) => resolvers.resolveFixedGenki(state, value),
      fixedStamina: (state, value) =>
        resolvers.resolveFixedStamina(state, value),
      score: (state, value, growth, rhs) =>
        resolvers.resolveScore(state, value, growth, rhs, (s) =>
          this.engine.turnManager.getTurnMultiplier(s),
        ),
      goodImpressionTurns: (state, value) =>
        resolvers.resolveGoodImpressionTurns(state, value),
      motivation: (state, value) => resolvers.resolveMotivation(state, value),
      goodConditionTurns: (state, value) =>
        resolvers.resolveGoodConditionTurns(state, value),
      concentration: (state, value) =>
        resolvers.resolveConcentration(state, value),
      genki: (state, value) => resolvers.resolveGenki(state, value),
      stamina: (state, value) => resolvers.resolveStamina(state, value),
      enthusiasm: (state, value) => resolvers.resolveEnthusiasm(state, value),
      fullPowerCharge: (state, value) =>
        resolvers.resolveFullPowerCharge(state, value),
    };
  }

  executeGrowthActions(growth, actions) {
    for (let i = 0; i < actions.length; i++) {
      this.executeGrowthAction(growth, actions[i]);
    }
  }

  executeGrowthAction(growth, action) {
    if (action.type === "assignment") {
      const { lhs, op, rhs } = action;

      if (rhs.type !== "number") {
        throw new Error(`Invalid growth action RHS: expected number`);
      }
      const rhsValue = rhs.value;

      let intermediate = growth[G[lhs]] || 0;

      if (op === "=") {
        intermediate = rhsValue;
      } else if (op === "+=") {
        intermediate += rhsValue;
      } else if (op === "-=") {
        intermediate -= rhsValue;
      }

      growth[G[lhs]] = intermediate;
      return;
    }

    console.warn(`Invalid growth action:`, action);
  }

  executeActions(state, actions, card) {
    // Pre-list values of the end-of-turn-decrement fields for the
    // fresh-buff bookkeeping at the bottom.
    const eotPrev = new Array(EOT_DECREMENT_FIELDS.length);
    for (let i = 0; i < EOT_DECREMENT_FIELDS.length; i++) {
      eotPrev[i] = state[EOT_DECREMENT_FIELDS[i]];
    }

    // Set modifiers
    const prevGoodConditionTurnsMultiplier =
      state[S.goodConditionTurnsMultiplier];
    const prevConcentrationMultiplier = state[S.concentrationMultiplier];
    const prevEnthusiasmMultiplier = state[S.enthusiasmMultiplier];
    const prevMotivationMultiplier = state[S.motivationMultiplier];
    const prevScoreTimes = state[S.scoreTimes];
    state[S.goodConditionTurnsMultiplier] = 1;
    state[S.concentrationMultiplier] = 1;
    state[S.enthusiasmMultiplier] = 1;
    state[S.motivationMultiplier] = 1;
    // Seed scoreTimes from the card's g.scoreTimes growth so legacy
    // growth-driven repeats still fire. Actions may also write to
    // state.scoreTimes directly before the first score action.
    state[S.scoreTimes] =
      state[S.cardMap][card]?.growth?.[G["g.scoreTimes"]] || 0;

    // Diffs are logged per action (and per scoreTimes repeat), before the
    // action's change triggers fire, so each logged delta belongs to
    // exactly the action that produced it. One snapshot covers the whole
    // list: logDiffs re-baselines it after every logged change. Nested
    // executions on this same state (free-use chains, stance-transition
    // effects) log in their own frames and patch this frame's baselines,
    // so an enclosing action never re-reports a nested delta.
    const logging = !this.logger.disabled;
    const snapshotDepth = this.diffSnapshots.length;
    const diffSnap = logging ? this.pushDiffSnapshot(state) : null;

    try {
      // Execute actions, triggering increase/decrease effects per-action
      // (matching actual game behavior where p-items trigger between actions)
      for (let i = 0; i < actions.length; i++) {
        // Only snapshot the full change-trigger field set when the current
        // phase actually fires change triggers. Most effect-action paths
        // (e.g. `cardUsed` phase) don't, so the ~30-field capture is wasted
        // work. Genki is captured unconditionally for the consumed-genki
        // accounting below.
        const phase = state[S.phase];
        const needsChangeTrigger =
          phase === "processCard" ||
          phase === "processCost" ||
          phase === "cardMovedToHand" ||
          phase === "cardMovedToHeld" ||
          (state[S.triggeredEffect]?.type === "reservation" &&
            state[S.triggeredEffect]?.source?.type === "skillCardEffect");
        const actionPrev = needsChangeTrigger
          ? snapshotWatchedFields(state)
          : null;
        const prevGenki = state[S.genki];
        const prevGoodImpressionTurns = state[S.goodImpressionTurns];

        this.executeAction(state, actions[i], card);

        // Apply scoreTimes to the first score action we see, then consume
        // it. `state[S.scoreTimes]` is seeded from g.scoreTimes above but
        // may also be written by a preceding action.
        let repeats = 0;
        if (state[S.scoreTimes]) {
          const action = actions[i];
          if (action.type === "assignment" && action.lhs === "score") {
            repeats = state[S.scoreTimes];
            state[S.scoreTimes] = 0;
          }
        }

        this.clampFields(state);
        if (logging) this.logDiffs(state, diffSnap);

        // Each repeat is executed and logged as its own hit — parity with
        // the game's separate score popups. Repeats only touch score, so
        // clamping between them is equivalent to the single trailing clamp.
        for (let j = 0; j < repeats; j++) {
          this.executeAction(state, actions[i], card);
          this.clampFields(state);
          if (logging) this.logDiffs(state, diffSnap);
        }

        // Fire increase/decrease triggers after each action
        if (needsChangeTrigger) {
          this.triggerChangeEffects(state, actionPrev);
        }

        // Consumed genki
        if (state[S.genki] < prevGenki) {
          state[S.consumedGenki] += prevGenki - state[S.genki];
        }
        if (
          phase === "processCost" &&
          state[S.goodImpressionTurns] < prevGoodImpressionTurns
        ) {
          state[S.consumedGoodImpressionTurns] +=
            prevGoodImpressionTurns - state[S.goodImpressionTurns];
        }
      }
    } finally {
      // Release frames (pool retains the arrays; drop state refs so dead
      // preview states aren't held alive between reuses).
      while (this.diffSnapshots.length > snapshotDepth) {
        this.diffSnapshots.pop().state = null;
      }
    }

    // Reset modifiers
    state[S.goodConditionTurnsMultiplier] = prevGoodConditionTurnsMultiplier;
    state[S.concentrationMultiplier] = prevConcentrationMultiplier;
    state[S.enthusiasmMultiplier] = prevEnthusiasmMultiplier;
    state[S.motivationMultiplier] = prevMotivationMultiplier;
    state[S.scoreTimes] = prevScoreTimes;

    // Protect fresh stats from decrement
    if (!state[S.unfreshPhase]) {
      for (let i = 0; i < EOT_DECREMENT_FIELDS.length; i++) {
        const field = EOT_DECREMENT_FIELDS[i];
        if (state[field] > 0 && eotPrev[i] == 0) {
          state[S.freshBuffs] |= 1 << i;
        }
      }
    }
  }

  pushDiffSnapshot(state) {
    const depth = this.diffSnapshots.length;
    let frame = this.snapshotPool[depth];
    if (!frame) {
      frame = this.snapshotPool[depth] = {
        state: null,
        snap: new Array(LOGGED_FIELDS.length),
      };
    }
    frame.state = state;
    const snap = frame.snap;
    for (let i = 0; i < LOGGED_FIELDS.length; i++) {
      snap[i] = state[LOGGED_FIELDS[i]];
    }
    this.diffSnapshots.push(frame);
    return snap;
  }

  // Log a diff for every logged field that changed since `snap`, then
  // patch the changed fields into every same-state snapshot on the stack
  // (including `snap` itself, re-baselining it for the caller's next
  // action). Patching keeps a delta from being reported twice: a nested
  // execution (free-use chain, stance-transition effect) logs it in its
  // own frame, and the enclosing action's later diff sees the patched
  // value as its baseline. Frames whose state differs are speculative
  // preview runs (strategy hold/free-use evaluation on fresh states) —
  // patching across states would corrupt the real run's baselines.
  // Known limitation: an action that both writes a field directly and
  // nested-triggers a change to the same field would under-report its own
  // share; no current action does both.
  logDiffs(state, snap) {
    const stack = this.diffSnapshots;
    for (let i = 0; i < LOGGED_FIELDS.length; i++) {
      const field = LOGGED_FIELDS[i];
      const curr = state[field];
      if (curr == snap[i]) continue;
      this.logger.log(state, "diff", {
        field,
        prev: formatDiffField(snap[i]),
        next: formatDiffField(curr),
      });
      for (let d = 0; d < stack.length; d++) {
        if (stack[d].state === state) {
          stack[d].snap[i] = curr;
        }
      }
    }
  }

  clampFields(state) {
    const config = this.getConfig(state);
    if (state[S.stamina] > config.idol.params.stamina) {
      state[S.stamina] = config.idol.params.stamina;
    }
    for (let i = 0; i < NON_NEGATIVE_FIELDS.length; i++) {
      if (state[NON_NEGATIVE_FIELDS[i]] < 0) {
        state[NON_NEGATIVE_FIELDS[i]] = 0;
      }
    }
  }

  triggerChangeEffects(state, prev) {
    // Cost consumed effects
    if (state[S.phase] == "processCost") {
      for (let i = 0; i < BUFF_FIELDS.length; i++) {
        if (state[BUFF_FIELDS[i]] < prev[BUFF_WATCH[i]]) {
          state[S.buffCostConsumed] = true;
          break;
        }
      }
    }

    // Trigger increase effects
    for (let i = 0; i < INCREASE_TRIGGER_FIELDS.length; i++) {
      const curr = state[INCREASE_TRIGGER_FIELDS[i]];
      const prior = prev[INCREASE_WATCH[i]];
      if (curr > prior) {
        const deltaField = INCREASE_DELTA_FIELDS[i];
        const phase = INCREASE_PHASES[i];
        state[deltaField] = curr - prior;
        this.engine.effectManager.triggerEffectsForPhase(state, phase);
        state[deltaField] = 0;
      }
    }

    // Trigger decrease effects
    for (let i = 0; i < DECREASE_TRIGGER_FIELDS.length; i++) {
      const curr = state[DECREASE_TRIGGER_FIELDS[i]];
      const prior = prev[DECREASE_WATCH[i]];
      if (curr < prior) {
        const deltaField = DECREASE_DELTA_FIELDS[i];
        const phase = DECREASE_PHASES[i];
        state[deltaField] = curr - prior;
        this.engine.effectManager.triggerEffectsForPhase(state, phase);
        state[deltaField] = 0;
      }
    }
  }

  executeAction(state, action, card) {
    let growth = null;
    if (card != null) {
      growth = state[S.cardMap][card].growth;
    }

    if (action.type === "identifier") {
      this.executeSpecialAction(state, action.name, growth);
      return;
    }

    if (action.type === "call") {
      this.executeCallAction(state, action, growth);
      return;
    }

    if (action.type === "assignment") {
      this.executeAssignment(state, action, growth);
      return;
    }

    console.warn(`Invalid action:`, action);
  }

  executeAssignment(state, action, growth) {
    const { lhs, lhsName, op, rhs } = action;

    // Handle effectCounter assignments
    if (lhs === "effectCounter") {
      const id = state[S.currentEffectInstanceId];
      const name = lhsName || "main";
      const rhsValue = this.engine.evaluator.evaluateExpression(state, rhs);

      // effectCounters is copy-on-write.
      const counters = { ...state[S.effectCounters] };
      const counter = { ...counters[id] };
      counters[id] = counter;
      state[S.effectCounters] = counters;
      if (counter[name] === undefined) {
        counter[name] = 0;
      }

      if (op === "+=") {
        counter[name] += rhsValue;
      } else if (op === "=") {
        counter[name] = rhsValue;
      } else {
        console.warn(`Unsupported effectCounter operation: ${op}`);
      }
      return;
    }

    // Nullify debuffs
    if (state[S.nullifyDebuff] && DEBUFF_FIELDS.includes(S[lhs])) {
      state[S.nullifyDebuff]--;
      return;
    }

    let rhsValue = this.engine.evaluator.evaluateExpression(state, rhs);
    let intermediate = state[S[lhs]] || 0;

    // Special cases with intermediates
    let intermediateField = null;
    if (
      ALWAYS_INTERMEDIATE.has(lhs) ||
      (op === "+=" && INTERMEDIATE_ON_ADD.has(lhs)) ||
      (lhs === "stamina" && op === "-=")
    ) {
      intermediate = 0;
      intermediateField = lhs;
    }

    // Execute operation
    if (op === "=") {
      intermediate = rhsValue;
    } else if (op === "+=") {
      intermediate += rhsValue;
      const growthIndex = GROWTH_INDEX_BY_FIELD.get(lhs);
      if (growth?.[growthIndex] && GROWABLE_FIELDS.includes(S[lhs])) {
        intermediate += growth[growthIndex];
      }
    } else if (op === "-=") {
      if (state[S.phase] === "processCost" || state[S.phase] === "checkCost") {
        if (growth?.[G["g.typedCost"]]) {
          rhsValue -= growth[G["g.typedCost"]];
          if (rhsValue < 0) rhsValue = 0;
        }
        if (state[S.doubleBuffCostTurns] > 0 && BUFF_FIELDS.includes(S[lhs])) {
          rhsValue *= 2;
        }
      }
      intermediate -= rhsValue;
    } else if (op === "*=") {
      intermediate *= rhsValue;
    } else if (op === "/=") {
      intermediate /= rhsValue;
    } else if (op === "%=") {
      intermediate %= rhsValue;
    } else {
      console.warn(`Unrecognized assignment operator: ${op}`);
    }

    if (intermediateField) {
      if (intermediateField in this.intermediateResolvers) {
        this.intermediateResolvers[intermediateField](
          state,
          intermediate,
          growth || {},
          rhs,
        );
      } else {
        console.warn(`Unresolved intermediate: ${intermediateField}`);
      }
    } else {
      state[S[lhs]] = intermediate;
    }

    // Round whole fields — skip ones already integer to avoid the
    // string round-trip through toFixed, which dominates the hot path.
    for (let i = 0; i < WHOLE_FIELDS.length; i++) {
      const field = WHOLE_FIELDS[i];
      const v = state[field];
      if (v === undefined || Number.isInteger(v)) continue;
      state[field] = Math.ceil(v.toFixed(2));
    }
  }

  executeCallAction(state, action, growth) {
    const { name, target, args } = action;

    if (name in this.specialActions) {
      if (state[S.nullifyDebuff] && DEBUFF_SPECIAL_ACTIONS.includes(name)) {
        state[S.nullifyDebuff]--;
        return;
      }

      const evaluatedArgs = [];

      if (target) {
        evaluatedArgs.push(target);
      }

      for (const arg of args) {
        if (arg.type === "identifier") {
          evaluatedArgs.push(arg.name);
        } else {
          evaluatedArgs.push(this.engine.evaluator.evaluateAST(state, arg));
        }
      }

      // Handle stance growth modifier
      if (growth && growth[G["g.stanceLevel"]] && name === "setStance") {
        if (evaluatedArgs[0].startsWith("str")) {
          evaluatedArgs[0] = "strength2";
        } else if (evaluatedArgs[0].startsWith("pre")) {
          evaluatedArgs[0] = "preservation2";
        }
      }

      this.specialActions[name](state, ...evaluatedArgs);
      return;
    }

    console.warn(`Unrecognized function call: ${name}`);
  }

  executeSpecialAction(state, actionName) {
    if (actionName in this.specialActions) {
      if (
        state[S.nullifyDebuff] &&
        DEBUFF_SPECIAL_ACTIONS.includes(actionName)
      ) {
        state[S.nullifyDebuff]--;
        return;
      }
      this.specialActions[actionName](state);
      return;
    }

    console.warn(`Unrecognized special action: ${actionName}`);
  }
}
