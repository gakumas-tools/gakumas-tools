/**
 * Validator schema.
 *
 * Whitelists of every identifier/function/phase/field the structured
 * engine understands. The validator walks parsed ASTs and flags any name
 * not in these sets — catches migration typos and DSL drift at data-build
 * time instead of during silent test divergence.
 *
 * Every set here derives from the engine itself:
 *   - PHASES, STATE_FIELDS: imported directly from engine/constants.js
 *   - SPECIAL_ACTIONS, VARIABLE_RESOLVERS: instantiate the real engine
 *     components against a stub engine and read back the keys of their
 *     `specialActions` / `variableResolvers` maps.
 * Adding or renaming a field/phase/action/resolver in the engine updates
 * the schema automatically on the next validator run — no manual edits.
 */
import {
  PHASES as ENGINE_PHASES,
  ALL_FIELDS,
} from "gakumas-engine/constants";
import TurnManager from "gakumas-engine/engine/TurnManager";
import CardManager from "gakumas-engine/engine/CardManager";
import BuffManager from "gakumas-engine/engine/BuffManager";
import Evaluator from "gakumas-engine/engine/Evaluator";

// Phases that `at:<phase>` may reference — engine constant.
export const PHASES = new Set(ENGINE_PHASES);

// Mutable state fields — anything in ALL_FIELDS (engine constants).
// Also usable on the RHS of expressions as a readable value.
export const STATE_FIELDS = new Set(ALL_FIELDS);

// Intermediate-resolver fields. Legal as assignment LHS even though they
// don't exist directly on state (Executor reroutes them).
export const INTERMEDIATE_FIELDS = new Set([
  "cost",
  "fixedGenki",
  "fixedStamina",
  "effectCounter",
]);

// Growth fields — legal on LHS in growth columns.
export const GROWTH_FIELDS = new Set([
  "g.score",
  "g.scoreTimes",
  "g.cost",
  "g.typedCost",
  "g.genki",
  "g.goodConditionTurns",
  "g.perfectConditionTurns",
  "g.concentration",
  "g.goodImpressionTurns",
  "g.motivation",
  "g.fullPowerCharge",
  "g.halfCostTurns",
  "g.scoreByGoodImpressionTurns",
  "g.scoreByMotivation",
  "g.scoreByGenki",
  "g.stanceLevel",
]);
export const GROWTH_ASSIGNABLE_FIELDS = new Set([
  "g.staminaCost",
]);

// Introspect the real engine components so the schema stays in lockstep.
// Stub engine supplies just the fields constructors touch (logger, plus
// the manager refs that Evaluator merges variableResolvers from).
function introspectEngine() {
  const stubEngine = { logger: {} };
  stubEngine.turnManager = new TurnManager(stubEngine);
  stubEngine.cardManager = new CardManager(stubEngine);
  stubEngine.buffManager = new BuffManager(stubEngine);
  const evaluator = new Evaluator(stubEngine);
  return {
    variableResolvers: Object.keys(evaluator.variableResolvers),
    specialActions: [
      ...Object.keys(stubEngine.cardManager.specialActions),
      ...Object.keys(stubEngine.buffManager.specialActions),
    ],
  };
}

const { variableResolvers, specialActions } = introspectEngine();

// Value-producing function calls / identifiers available in condition or
// expression position (not actions). Union of variableResolvers from every
// engine component.
export const VARIABLE_RESOLVERS = new Set(variableResolvers);

// Action names (identifier form or call form) — all names in any
// specialActions map on an engine component.
export const SPECIAL_ACTIONS = new Set(specialActions);

// Stance names (valid identifiers resolved to string stance).
export const STANCES = new Set([
  "none",
  "strength",
  "strength2",
  "preservation",
  "preservation2",
  "leisure",
  "fullPower",
]);

// SOURCE_TYPES / RARITIES / SKILL_CARD_TYPES — legal identifiers in
// comparisons like `cardSourceType == pIdol`.
export const SOURCE_TYPES = new Set(["default", "produce", "pIdol", "support"]);
export const RARITIES = new Set(["N", "R", "SR", "SSR", "T", "L"]);
export const SKILL_CARD_TYPES = new Set(["active", "mental", "trouble"]);

// Turn types (compared against isVocalTurn etc. — but also referenced as
// literals in some data).
export const TURN_TYPES = new Set(["vocal", "dance", "visual"]);

// Target-expression identifiers (appear inside `target:` / `[...]`).
export const TARGET_IDENTIFIERS = new Set([
  "this",
  "hand",
  "deck",
  "discarded",
  "held",
  "removed",
  "all",
  "active",
  "mental",
  "trouble",
  "basic",
  "pIdol",
  "T",
  "N",
  "R",
  "SR",
  "SSR",
  "L",
]);

// Target-expression function calls (appear inside `target:` / `[...]`).
export const TARGET_FUNCTIONS = new Set(["effect", "cost", "baseId", "id", "selectUpto"]);

// Filter identifiers on `at:phase[...]` phase filters — reuse target ids.
// (The engine evaluates phase filters via getTargetRuleCards.)

// AST modifier names parseable by the parser.
export const MODIFIERS = new Set([
  "limit",
  "ttl",
  "delay",
  "group",
  "line",
  "level",
]);
