/**
 * Effect/patch AST validator.
 *
 * Walks a parsed AST and reports any identifier, function, phase, or field
 * that isn't in the schema. Catches migration typos in data that never
 * happens to fire in tests.
 *
 * Usage:
 *   const errors = validateEffectAst(parseEffects(src), { growth: true });
 *   errors.forEach(e => console.error(e));
 */
import {
  GROWTH_FIELDS,
  INTERMEDIATE_FIELDS,
  MODIFIERS,
  PHASES,
  RARITIES,
  SKILL_CARD_TYPES,
  SOURCE_TYPES,
  SPECIAL_ACTIONS,
  STANCES,
  STATE_FIELDS,
  TARGET_FUNCTIONS,
  TARGET_IDENTIFIERS,
  TURN_TYPES,
  VARIABLE_RESOLVERS,
} from "./schema.js";

// Names legal as "readable" identifiers in a condition or RHS expression.
// Union of anything the Evaluator can resolve. Phases are included because
// `parentPhase == processCost` style comparisons reference phase names.
const READABLE_IDENTIFIERS = new Set([
  ...STATE_FIELDS,
  ...VARIABLE_RESOLVERS,
  ...STANCES,
  ...SOURCE_TYPES,
  ...RARITIES,
  ...SKILL_CARD_TYPES,
  ...PHASES,
]);

// Names legal as a bare identifier argument, which functions read as a
// name rather than a value: `cardHasEffect(fixedStamina)` passes an
// intermediate field, and turn types can be passed the same way. The
// Evaluator can't read these as values.
const ARG_IDENTIFIERS = new Set([
  ...READABLE_IDENTIFIERS,
  ...INTERMEDIATE_FIELDS,
  ...TURN_TYPES,
]);

// Names legal as a function call in condition/RHS position. Special actions
// only run as statements; the Evaluator can't call them in an expression.
const CALLABLE_RESOLVERS = new Set(VARIABLE_RESOLVERS);

// Names legal as assignment LHS.
const ASSIGNABLE_FIELDS = new Set([
  ...STATE_FIELDS,
  ...INTERMEDIATE_FIELDS,
  ...GROWTH_FIELDS, // growth assignments live alongside regular ones
]);

/**
 * Validate an effect-sequence AST (from parseEffects).
 * Returns an array of error strings. Empty array means OK.
 */
export function validateEffectAst(ast) {
  const errors = [];
  if (!ast) return errors;

  if (ast.type === "sequence") {
    for (const node of ast.effects) validateNode(node, errors);
  } else {
    validateNode(ast, errors);
  }
  return errors;
}

/**
 * Validate a patch-sequence AST (from parsePatches).
 */
export function validatePatchAst(ast) {
  const errors = [];
  if (!ast) return errors;

  if (ast.type !== "patchSequence") {
    errors.push(`Expected patchSequence, got ${ast.type}`);
    return errors;
  }
  for (const patch of ast.patches) {
    if (patch.op === "append") {
      validateNode(patch.effect, errors);
    } else if (patch.op === "patch") {
      validateNode(patch.effect, errors);
    } else {
      errors.push(`Unknown patch op: ${patch.op}`);
    }
  }
  return errors;
}

function validateNode(node, errors) {
  if (!node) return;
  switch (node.type) {
    case "phase":
      if (!PHASES.has(node.phase)) {
        errors.push(`Unknown phase: at:${node.phase}`);
      }
      if (node.filter) validateTargetExpr(node.filter, errors);
      for (const child of node.body || []) validateNode(child, errors);
      break;

    case "condition":
      validateExpr(node.expr, errors);
      for (const child of node.body || []) validateNode(child, errors);
      break;

    case "target":
      validateTargetExpr(node.target, errors);
      for (const child of node.body || []) validateNode(child, errors);
      break;

    case "action":
      validateActionExpr(node.expr, errors);
      break;

    case "actionBlock":
      for (const child of node.body || []) validateNode(child, errors);
      break;

    case "limit":
    case "ttl":
    case "delay":
    case "group":
    case "line":
    case "level":
      // Parser already restricts modifier names; nothing to check here.
      break;

    default:
      if (MODIFIERS.has(node.type)) break;
      errors.push(`Unknown AST node type: ${node.type}`);
  }
}

// Validate an action expression — assignments, calls, identifiers.
function validateActionExpr(expr, errors) {
  if (!expr) return;
  if (expr.type === "assignment") {
    if (!ASSIGNABLE_FIELDS.has(expr.lhs)) {
      errors.push(`Unknown assignment target: ${expr.lhs}`);
    }
    validateExpr(expr.rhs, errors);
    return;
  }
  if (expr.type === "call") {
    if (!SPECIAL_ACTIONS.has(expr.name)) {
      errors.push(`Unknown action call: ${expr.name}`);
    }
    if (expr.target) validateTargetExpr(expr.target, errors);
    for (const arg of expr.args || []) validateArg(arg, errors);
    return;
  }
  if (expr.type === "identifier") {
    if (!SPECIAL_ACTIONS.has(expr.name)) {
      errors.push(`Unknown bare action: ${expr.name}`);
    }
    return;
  }
  errors.push(`Unexpected action expression type: ${expr.type}`);
}

// Validate a condition/RHS expression — readable identifiers and calls.
function validateExpr(expr, errors) {
  if (!expr) return;
  switch (expr.type) {
    case "number":
      return;
    case "identifier":
      if (!READABLE_IDENTIFIERS.has(expr.name)) {
        errors.push(`Unknown identifier: ${expr.name}`);
      }
      return;
    case "call":
      if (expr.name === "floor") {
        for (const arg of expr.args || []) validateExpr(arg, errors);
        return;
      }
      if (!CALLABLE_RESOLVERS.has(expr.name)) {
        errors.push(`Unknown function call: ${expr.name}`);
      }
      if (expr.target) validateTargetExpr(expr.target, errors);
      // effectCounter's arg is a free-form counter name created on first
      // use (Evaluator defaults it to "main"), not a readable identifier.
      if (expr.name === "effectCounter") return;
      for (const arg of expr.args || []) validateArg(arg, errors);
      return;
    case "binary":
      validateExpr(expr.left, errors);
      validateExpr(expr.right, errors);
      return;
    case "unary":
      validateExpr(expr.operand, errors);
      return;
    case "comparison":
      validateExpr(expr.left, errors);
      validateExpr(expr.right, errors);
      return;
    case "assignment":
      validateExpr(expr.rhs, errors);
      return;
    default:
      errors.push(`Unexpected expression type: ${expr.type}`);
  }
}

// Validate a target expression (AST node from parseCondition inside `[...]`).
function validateTargetExpr(node, errors) {
  if (!node) return;
  switch (node.type) {
    case "number":
      return;
    case "identifier":
      if (!TARGET_IDENTIFIERS.has(node.name)) {
        errors.push(`Unknown target identifier: ${node.name}`);
      }
      return;
    case "call":
      if (!TARGET_FUNCTIONS.has(node.name)) {
        errors.push(`Unknown target function: ${node.name}`);
      }
      // Args are card IDs or effect names — no deep validation.
      return;
    case "binary":
      validateTargetExpr(node.left, errors);
      validateTargetExpr(node.right, errors);
      return;
    case "unary":
      validateTargetExpr(node.operand, errors);
      return;
    case "comparison":
      // target filters may compare cardSourceType etc. — fall through to expr
      validateExpr(node.left, errors);
      validateExpr(node.right, errors);
      return;
    default:
      errors.push(`Unexpected target expression type: ${node.type}`);
  }
}

function validateArg(arg, errors) {
  if (!arg) return;
  // Function args accept identifiers (like `pIdol` stance name,
  // rarity, buff-count names) as well as numbers and nested expressions.
  if (arg.type === "identifier") {
    if (!ARG_IDENTIFIERS.has(arg.name)) {
      errors.push(`Unknown identifier: ${arg.name}`);
    }
    return;
  }
  validateExpr(arg, errors);
}
