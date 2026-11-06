/**
 * AST Serialization
 *
 * Converts AST nodes back to effect string format.
 * Used for debugging, display, and effect merging.
 */

/**
 * Get operator precedence (higher = binds tighter)
 */
function getOpPrecedence(op) {
  switch (op) {
    case "|":
      return 1;
    case "&":
      return 2;
    case "+":
    case "-":
      return 3;
    case "*":
    case "/":
    case "%":
      return 4;
    default:
      return 0;
  }
}

/**
 * Serialize an expression AST node back to string
 * @param {Object} node - AST node
 * @param {number} parentPrecedence - Precedence of parent operator (for adding parens)
 */
export function serializeExpr(node, parentPrecedence = 0) {
  if (!node) return "";

  switch (node.type) {
    case "number":
      return String(node.value);

    case "identifier":
      return node.name;

    case "call": {
      let result = node.name;
      if (node.target) {
        result += `[${serializeExpr(node.target, 0)}]`;
      }
      if (node.args && node.args.length > 0) {
        const args = node.args.map((a) => serializeExpr(a, 0)).join(", ");
        result += `(${args})`;
      }
      return result;
    }

    case "binary": {
      const myPrecedence = getOpPrecedence(node.op);
      const left = serializeExpr(node.left, myPrecedence);
      const right = serializeExpr(node.right, myPrecedence + 0.5);
      const result = `${left} ${node.op} ${right}`;
      if (parentPrecedence > myPrecedence) {
        return `(${result})`;
      }
      return result;
    }

    case "unary":
      return `${node.op}${serializeExpr(node.operand, 10)}`;

    case "comparison":
      return `${serializeExpr(node.left, 0)}${node.op}${serializeExpr(node.right, 0)}`;

    case "assignment":
      if (node.lhsName) {
        return `${node.lhs}(${node.lhsName})${node.op}${serializeExpr(node.rhs, 0)}`;
      }
      return `${node.lhs}${node.op}${serializeExpr(node.rhs, 0)}`;

    default:
      console.warn("Unknown node type in serialization:", node.type);
      return String(node);
  }
}

function getModifierLines(effect, indent) {
  const pad = "  ".repeat(indent);
  const lines = [];

  if (effect.limit != null) lines.push(`${pad}limit:${effect.limit}`);
  if (effect.ttl != null) lines.push(`${pad}ttl:${effect.ttl}`);
  if (effect.delay != null) lines.push(`${pad}delay:${effect.delay}`);
  if (effect.group != null) lines.push(`${pad}group:${effect.group}`);
  if (effect.line != null) lines.push(`${pad}line:${effect.line}`);
  if (effect.level != null) lines.push(`${pad}level:${effect.level}`);

  return lines;
}

// Statements are separated by `;` as well as newlines so the output still
// parses after whitespace is stripped (the stage customizer does this).
function renderLeafEffect(effect, indent, wrapped = false) {
  const pad = "  ".repeat(indent);
  const bodyPad = "  ".repeat(indent + 1);
  const actionLines = (effect.actions || []).map(
    (action) => `${bodyPad}${serializeExpr(action)}`
  );
  const nestedLines = (effect.effects || [])
    .map((nested) => serializeEffect(nested, indent + 1).trimEnd())
    .filter(Boolean);
  const modifierLines = getModifierLines(effect, indent + 1);
  const lines = [...actionLines, ...nestedLines, ...modifierLines];

  if (lines.length === 0) {
    return "";
  }

  // `do { }` blocks only hold actions and modifiers. Inside a wrapper, a
  // plain body of actions, nested effects and modifiers transforms back to
  // this same single effect.
  if (wrapped && nestedLines.length > 0) {
    const bodyLines = [
      ...(effect.actions || []).map((action) => `${pad}${serializeExpr(action)}`),
      ...effect.effects
        .map((nested) => serializeEffect(nested, indent).trimEnd())
        .filter(Boolean),
      ...getModifierLines(effect, indent),
    ];
    return `${bodyLines.join(";\n")}\n`;
  }

  if ((effect.actions || []).length === 0 && nestedLines.length === 0) {
    return `${modifierLines.map((line) => line.slice(2)).join(";\n")}\n`;
  }

  if (
    (effect.actions || []).length === 1 &&
    nestedLines.length === 0 &&
    modifierLines.length === 0
  ) {
    return `${actionLines[0].slice(2)}\n`;
  }

  return `${pad}do {\n${lines.join(";\n")}\n${pad}}\n`;
}

/**
 * Serialize an effect back to the new string format (for debugging/display)
 */
export function serializeEffect(effect, indent = 0) {
  const pad = "  ".repeat(indent);
  const wrappers = [];

  const anchorPrefix = effect.anchor ? `@${effect.anchor} ` : "";

  if (effect.phase) {
    const filter = effect.filter ? `[${serializeExpr(effect.filter)}]` : "";
    wrappers.push(`at:${effect.phase}${filter}`);
  }
  // One `if:` per condition, so the conditions list parses back unchanged.
  for (const condition of effect.conditions || []) {
    wrappers.push(`if:${serializeExpr(condition)}`);
  }
  if (effect.targets && effect.targets.length > 0) {
    for (const target of effect.targets) {
      // `transformTargetBlock` unwraps identifier targets to bare strings
      // while leaving complex expressions as AST nodes — serialize both.
      wrappers.push(
        `target:${typeof target === "string" ? target : serializeExpr(target)}`
      );
    }
  }

  if (wrappers.length === 0) {
    const leaf = renderLeafEffect(effect, indent);
    if (!anchorPrefix) return leaf;
    return leaf.replace(/^(\s*)/, `$1${anchorPrefix}`);
  }

  let result = "";
  for (let i = 0; i < wrappers.length; i++) {
    const padI = "  ".repeat(indent + i);
    const prefix = i === 0 ? anchorPrefix : "";
    result += `${padI}${prefix}${wrappers[i]} {\n`;
  }

  const bodyIndent = indent + wrappers.length;
  const leafEffect = {
    ...effect,
    phase: null,
    filter: null,
    conditions: null,
    targets: null,
    anchor: null,
  };
  const body = renderLeafEffect(leafEffect, bodyIndent, true);
  if (body) {
    result += body;
  }

  for (let i = wrappers.length - 1; i >= 0; i--) {
    result += `${"  ".repeat(indent + i)}}\n`;
  }

  return result;
}

/**
 * Serialize a list of patch records back to string form.
 * Matches the patch grammar: '+ effect' or '@name partialEffect'.
 */
export function serializePatches(patches) {
  return patches
    .map((record) => {
      if (record.op === "append") {
        const body = serializeEffect(record.effect, 0).trimEnd();
        const levelSuffix = record.level != null ? `; level:${record.level}` : "";
        return `+ ${body}${levelSuffix}`;
      }
      if (record.op === "patch") {
        const body = serializePartial(record.delta).trimEnd();
        const head = `@${record.anchor}`;
        const levelSuffix = record.level != null ? `; level:${record.level}` : "";
        return body ? `${head} ${body}${levelSuffix}` : `${head}${levelSuffix}`;
      }
      throw new Error(`Unknown patch op: ${record.op}`);
    })
    .join(";\n");
}

function serializePartial(delta) {
  const wrappers = [];
  if (delta.phase) wrappers.push(`at:${delta.phase}`);
  if (delta.conditions && delta.conditions.length > 0) {
    wrappers.push(`if:${delta.conditions.map(serializeExpr).join(" & ")}`);
  }
  if (delta.targets && delta.targets.length > 0) {
    for (const target of delta.targets) {
      wrappers.push(`target:${target}`);
    }
  }

  const hasBodyContent =
    (delta.actions && delta.actions.length > 0) ||
    delta.limit != null ||
    delta.ttl != null ||
    delta.delay != null ||
    delta.group != null;

  if (wrappers.length === 0) {
    return renderLeafEffect(delta, 0);
  }

  if (!hasBodyContent) {
    // body-less phase/condition/target: just emit the wrapper heads
    return wrappers.join(" ") + "\n";
  }

  let result = "";
  for (let i = 0; i < wrappers.length; i++) {
    result += `${"  ".repeat(i)}${wrappers[i]} {\n`;
  }
  const leaf = {
    ...delta,
    phase: null,
    conditions: null,
    targets: null,
    anchor: null,
  };
  const body = renderLeafEffect(leaf, wrappers.length);
  if (body) result += body;
  for (let i = wrappers.length - 1; i >= 0; i--) {
    result += `${"  ".repeat(i)}}\n`;
  }
  return result;
}
