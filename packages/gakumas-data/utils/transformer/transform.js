/**
 * AST to Engine Format Transformer
 *
 * Transforms the AST from the parser into the flattened effect structure
 * that the engine expects.
 *
 * Input (AST):
 * {
 *   type: 'sequence',
 *   effects: [
 *     {
 *       type: 'phase',
 *       phase: 'startOfTurn',
 *       body: [
 *         { type: 'condition', expr: {...}, body: [...] },
 *         { type: 'action', expr: {...} },
 *         { type: 'limit', value: 1 }
 *       ]
 *     }
 *   ]
 * }
 *
 * Output (Engine format):
 * [
 *   {
 *     phase: 'startOfTurn',
 *     conditions: [conditionAST],
 *     actions: [actionAST],
 *     limit: 1,
 *     ttl: null,
 *     delay: null,
 *     group: 0,
 *     targets: null,
 *     effects: null
 *   }
 * ]
 */

const MODIFIER_TYPES = ["limit", "ttl", "delay", "group", "line", "level"];

function isModifier(node) {
  return MODIFIER_TYPES.includes(node.type);
}

/**
 * Transform an AST into the engine's effect format
 * @param {Object} ast - The parsed AST
 * @returns {Array} Array of effect objects for the engine
 */
export function transformEffects(ast) {
  if (ast.type !== "sequence") {
    throw new Error("Expected sequence at top level");
  }

  const results = [];
  let pendingActions = [];
  let pendingModifiers = {};

  let pendingAnchor = null;

  const flushPending = () => {
    if (pendingActions.length > 0) {
      const effect = { actions: pendingActions };
      Object.assign(effect, pendingModifiers);
      if (pendingAnchor) effect.anchor = pendingAnchor;
      results.push(effect);
      pendingActions = [];
      pendingModifiers = {};
      pendingAnchor = null;
    } else if (Object.keys(pendingModifiers).length > 0 && results.length > 0) {
      Object.assign(results[results.length - 1], pendingModifiers);
      pendingModifiers = {};
    }
  };

  for (const node of ast.effects) {
    if (isModifier(node)) {
      pendingModifiers[node.type] = node.value;
    } else if (node.type === "action") {
      // Anchored actions form their own effect — don't merge with unanchored pending
      if (node.anchor) {
        flushPending();
        pendingAnchor = node.anchor;
        pendingActions.push(node.expr);
        continue;
      }
      // If we have pending modifiers but no pending actions, apply to last result
      if (
        Object.keys(pendingModifiers).length > 0 &&
        pendingActions.length === 0 &&
        results.length > 0
      ) {
        Object.assign(results[results.length - 1], pendingModifiers);
        pendingModifiers = {};
      }
      pendingActions.push(node.expr);
    } else if (node.type === "actionBlock") {
      flushPending();

      const transformed = transformNode(node, {});
      applyAnchor(transformed, node.anchor);
      results.push(...transformed);
    } else {
      // Flush pending actions/modifiers before processing blocks
      flushPending();

      // Transform the block normally
      const transformed = transformNode(node, {});
      applyAnchor(transformed, node.anchor);
      results.push(...transformed);
    }
  }

  // Flush any remaining actions/modifiers
  flushPending();

  return results;
}

/**
 * Transform a single AST node, inheriting context from parents
 */
function transformNode(node, context) {
  switch (node.type) {
    case "phase":
      return transformPhaseBlock(node, context);
    case "condition":
      return transformConditionBlock(node, context);
    case "target":
      return transformTargetBlock(node, context);
    case "action":
      return transformAction(node, context);
    case "actionBlock":
      return transformActionBlock(node, context);
    default:
      if (isModifier(node)) {
        return [{ _pending: { [node.type]: node.value } }];
      }
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

// Attach an anchor to the first effect in the array, unless it already has
// one from a sub-expression anchor (inner wins — more specific).
function applyAnchor(effects, anchor) {
  if (!anchor || effects.length === 0) return;
  if (!effects[0].anchor) effects[0].anchor = anchor;
}

// Simple identifier filters on card-used phases map to the corresponding
// legacy special phase so firing order matches (activeCardUsed fires after
// cardUsed, etc.). More complex filters fire at the base phase with the
// filter attached.
const PHASE_FILTER_SHORTCUTS = {
  "cardUsed:active": "activeCardUsed",
  "cardUsed:mental": "mentalCardUsed",
  "afterCardUsed:active": "afterActiveCardUsed",
  "afterCardUsed:mental": "afterMentalCardUsed",
};

function transformPhaseBlock(node, context) {
  let phase = node.phase;
  let filter = node.filter;
  if (filter && filter.type === "identifier") {
    const shortcut = PHASE_FILTER_SHORTCUTS[`${phase}:${filter.name}`];
    if (shortcut) {
      phase = shortcut;
      filter = null;
    }
  }
  const nextContext = { ...context, phase };
  if (filter) nextContext.filter = filter;
  return transformBody(node.body, nextContext);
}

function transformConditionBlock(node, context) {
  const conditions = context.conditions ? [...context.conditions] : [];
  conditions.push(node.expr);
  return transformBody(node.body, { ...context, conditions });
}

function transformTargetBlock(node, context) {
  const targets = context.targets ? [...context.targets] : [];
  // Extract the target name from the AST node
  const targetName = node.target.type === "identifier" ? node.target.name : node.target;
  targets.push(targetName);
  return transformBody(node.body, { ...context, targets });
}

function transformAction(node, context) {
  const effect = createEffect(context);
  effect.actions = [node.expr];
  return [effect];
}

function transformActionBlock(node, context) {
  const effect = createEffect(context);
  const modifiers = {};
  const actions = [];

  for (const child of node.body) {
    if (child.type === "action") {
      actions.push(child.expr);
    } else if (isModifier(child)) {
      modifiers[child.type] = child.value;
    } else {
      throw new Error(`Unsupported node in do block: ${child.type}`);
    }
  }

  if (actions.length > 0) {
    effect.actions = actions;
  }
  Object.assign(effect, modifiers);

  return [effect];
}

/**
 * Transform a body (list of nodes)
 * Collects all actions into a single effect with modifiers
 */
function transformBody(body, context) {
  const results = [];
  let pendingActions = [];
  let pendingModifiers = {};
  let pendingNestedPhases = [];

  const flushPending = () => {
    if (
      pendingActions.length === 0 &&
      Object.keys(pendingModifiers).length === 0 &&
      pendingNestedPhases.length === 0
    ) {
      return;
    }
    if (pendingActions.length === 0 && pendingNestedPhases.length === 0) {
      // Modifiers only — apply to last result.
      if (results.length > 0) {
        Object.assign(results[results.length - 1], pendingModifiers);
      }
      pendingModifiers = {};
      return;
    }
    const effect = createEffect(context);
    if (pendingActions.length > 0) effect.actions = pendingActions;
    Object.assign(effect, pendingModifiers);
    if (pendingNestedPhases.length > 0) {
      effect.effects = [...pendingNestedPhases];
    }
    results.push(effect);
    pendingActions = [];
    pendingModifiers = {};
    pendingNestedPhases = [];
  };

  for (const node of body) {
    if (isModifier(node)) {
      pendingModifiers[node.type] = node.value;
    } else if (node.type === "phase") {
      // Nested phase blocks become nested effects. Preserve any anchor
      // attached to the phase block itself.
      const nestedEffects = transformPhaseBlock(node, {});
      applyAnchor(nestedEffects, node.anchor);
      pendingNestedPhases.push(...nestedEffects);
    } else if (node.type === "action") {
      // An anchored action is emitted as its own effect so that
      // customizations can patch that single line.
      if (node.anchor) {
        flushPending();
        const anchored = createEffect(context);
        anchored.actions = [node.expr];
        anchored.anchor = node.anchor;
        results.push(anchored);
      } else {
        pendingActions.push(node.expr);
      }
    } else if (node.type === "actionBlock") {
      flushPending();
      const nested = transformActionBlock(node, context);
      applyAnchor(nested, node.anchor);
      results.push(...nested);
    } else if (node.type === "condition" || node.type === "target") {
      flushPending();
      const nested = transformNode(node, context);
      applyAnchor(nested, node.anchor);
      results.push(...nested);
    }
  }

  // Flush remaining actions
  if (pendingActions.length > 0) {
    const effect = createEffect(context);
    effect.actions = pendingActions;
    Object.assign(effect, pendingModifiers);
    if (pendingNestedPhases.length > 0) {
      effect.effects = [...pendingNestedPhases];
    }
    results.push(effect);
  } else if (results.length === 0) {
    // Empty body - still create effect if we have meaningful context
    const effect = createEffect(context);
    Object.assign(effect, pendingModifiers);
    if (pendingNestedPhases.length > 0) {
      effect.effects = [...pendingNestedPhases];
    }
    if (effect.phase || effect.effects || effect.conditions || effect.targets) {
      results.push(effect);
    }
  } else if (results.length > 0) {
    // Apply orphan modifiers to ALL results (e.g., limit:3 at phase level applies to all effects)
    if (Object.keys(pendingModifiers).length > 0) {
      for (const effect of results) {
        Object.assign(effect, pendingModifiers);
      }
    }
    // Apply orphan nested phases to last result
    if (pendingNestedPhases.length > 0) {
      const lastResult = results[results.length - 1];
      if (!lastResult.effects) {
        lastResult.effects = [];
      }
      lastResult.effects.push(...pendingNestedPhases);
    }
  }

  return results;
}

/**
 * Create a new effect object with inherited context
 */
function createEffect(context) {
  const effect = {};

  if (context.phase) {
    effect.phase = context.phase;
  }

  if (context.filter) {
    effect.filter = context.filter;
  }

  if (context.conditions && context.conditions.length > 0) {
    effect.conditions = [...context.conditions];
  }

  if (context.targets && context.targets.length > 0) {
    effect.targets = [...context.targets];
  }

  return effect;
}

/**
 * Transform a patch sequence AST into an array of patch records:
 *   { op: 'append', effect: {...}, level? }
 *   { op: 'patch',  anchor: 'name', delta: {...}, level? }
 *
 * Each patch carries a field-wise delta — only fields the patch mentions
 * are set. The engine merges the delta into the anchored effect at runtime.
 */
export function transformPatches(ast) {
  if (ast.type !== "patchSequence") {
    throw new Error("Expected patchSequence at top level");
  }

  return ast.patches.flatMap((patch) => {
    if (patch.op === "append") {
      // An appended block can expand to several effects (e.g. two `if:`
      // branches); append each one.
      const effects = transformEffects({
        type: "sequence",
        effects: [patch.effect],
      });
      return effects.map((effect) => {
        const record = { op: "append", effect };
        hoistPatchMeta(record, effect);
        applyPatchModifiers(effect, patch);
        applyPatchLevelFields(record, patch);
        return record;
      });
    }

    if (patch.op === "patch") {
      const delta = buildDelta(patch.effect);
      const record = { op: "patch", anchor: patch.anchor, delta };
      hoistPatchMeta(record, delta);
      applyPatchModifiers(delta, patch);
      applyPatchLevelFields(record, patch);
      return record;
    }

    throw new Error(`Unknown patch op: ${patch.op}`);
  });
}

const PATCH_LEVEL_FIELDS = ["level"];

// Modifiers written after a patch (`+ score+=1; limit:1`) are attached to
// the patch by the parser; they belong to the effect it appends or patches.
const PATCH_MODIFIER_FIELDS = MODIFIER_TYPES.filter(
  (type) => !PATCH_LEVEL_FIELDS.includes(type),
);

function applyPatchModifiers(target, patch) {
  for (const key of PATCH_MODIFIER_FIELDS) {
    if (patch[key] != null) target[key] = patch[key];
  }
}

function applyPatchLevelFields(record, patch) {
  for (const key of PATCH_LEVEL_FIELDS) {
    if (patch[key] != null) record[key] = patch[key];
  }
}

// Pull `level` off the effect/delta onto the patch record — level is
// a patch-selector attribute (which rank of the customization is installed),
// not a runtime effect property.
function hoistPatchMeta(record, target) {
  if (!target) return;
  if (target.level != null) {
    record.level = target.level;
    delete target.level;
  }
}

/**
 * Build a partial-effect delta from a single effect AST node.
 * Only fields mentioned in the AST are set on the delta.
 */
function buildDelta(node) {
  const delta = {};
  applyToDelta(delta, node);
  return delta;
}

function applyToDelta(delta, node) {
  if (!node) return;
  switch (node.type) {
    case "phase": {
      // Apply the same phase-filter shortcut as transformPhaseBlock so
      // patches using `at:cardUsed[active]` map to the legacy special phase.
      let phase = node.phase;
      let filter = node.filter;
      if (filter && filter.type === "identifier") {
        const shortcut = PHASE_FILTER_SHORTCUTS[`${phase}:${filter.name}`];
        if (shortcut) {
          phase = shortcut;
          filter = null;
        }
      }
      delta.phase = phase;
      if (filter) delta.filter = filter;
      for (const child of node.body) applyToDelta(delta, child);
      break;
    }
    // Nested blocks add to the outer conditions/targets, as in effects.
    case "condition":
      delta.conditions = [...(delta.conditions || []), node.expr];
      for (const child of node.body) applyToDelta(delta, child);
      break;
    case "target": {
      const targetName =
        node.target.type === "identifier" ? node.target.name : node.target;
      delta.targets = [...(delta.targets || []), targetName];
      for (const child of node.body) applyToDelta(delta, child);
      break;
    }
    case "action":
      if (!delta.actions) delta.actions = [];
      delta.actions.push(node.expr);
      break;
    case "actionBlock": {
      const actions = [];
      for (const child of node.body) {
        if (child.type === "action") {
          actions.push(child.expr);
        } else if (isModifier(child)) {
          delta[child.type] = child.value;
        } else {
          throw new Error(`Unsupported node in patch do block: ${child.type}`);
        }
      }
      delta.actions = actions;
      break;
    }
    default:
      if (isModifier(node)) {
        delta[node.type] = node.value;
        return;
      }
      throw new Error(`Unknown patch body node type: ${node.type}`);
  }
}
