import {
  PHASES,
  SKILL_CARD_TYPES,
  STANCES,
  S,
  SOURCE_TYPES,
  RARITIES,
} from "../constants";
import EngineComponent from "./EngineComponent";

const FIELD_INDEX = new Map(Object.entries(S));
const CONSTANT_NAMES = new Set([
  ...STANCES,
  ...PHASES,
  ...SOURCE_TYPES,
  ...RARITIES,
  ...SKILL_CARD_TYPES,
]);

function warning(message) {
  return () => {
    console.warn(message);
    return undefined;
  };
}

export default class Evaluator extends EngineComponent {
  constructor(engine) {
    super(engine);

    this.variableResolvers = {
      maxStamina: (state) => this.getConfig(state).idol.params.stamina,
      clearRatio: () => 0,
      effectCounter: (state, name = "main") => {
        const id = state[S.currentEffectInstanceId];
        return state[S.effectCounters]?.[id]?.[name] ?? 0;
      },
      ...this.engine.turnManager.variableResolvers,
      ...this.engine.cardManager.variableResolvers,
      ...this.engine.buffManager.variableResolvers,
    };

    // AST node -> compiled (state) => value. AST nodes are immutable.
    this.compiled = new WeakMap();
  }

  /**
   * Evaluate a condition (AST node)
   */
  evaluateCondition(state, condition) {
    const result = this.evaluateAST(state, condition);
    this.logger.debug("Condition", condition, result);
    return result;
  }

  /**
   * Evaluate an expression (AST node)
   */
  evaluateExpression(state, expr) {
    return this.evaluateAST(state, expr);
  }

  /**
   * Evaluate an AST node
   */
  evaluateAST(state, node) {
    if (!node) {
      console.warn("Null AST node");
      return undefined;
    }
    let evaluate = this.compiled.get(node);
    if (evaluate === undefined) {
      evaluate = this.compile(node);
      this.compiled.set(node, evaluate);
    }
    return evaluate(state);
  }

  compileChild(node) {
    if (!node) return warning("Null AST node");
    return this.compile(node);
  }

  compile(node) {
    switch (node.type) {
      case "number": {
        const value = node.value;
        return () => value;
      }

      case "identifier":
        return this.compileIdentifier(node.name);

      case "call":
        return this.compileCall(node);

      case "binary":
        return this.compileBinary(node);

      case "unary":
        return this.compileUnary(node);

      case "comparison":
        return this.compileComparison(node);

      case "assignment":
        // Assignments are handled by Executor, not Evaluator
        // But we may need to evaluate the RHS
        return this.compileChild(node.rhs);

      default:
        return warning(`Unknown AST node type: ${node.type}`);
    }
  }

  /**
   * Resolve an identifier to its value: state variables, then variable
   * resolvers, then stance/phase/source type/rarity/card type names.
   */
  compileIdentifier(name) {
    const fallback = this.compileNonStateIdentifier(name);
    const index = FIELD_INDEX.get(name);
    if (index === undefined) return fallback;
    return (state) => (index in state ? state[index] : fallback(state));
  }

  compileNonStateIdentifier(name) {
    if (name in this.variableResolvers) {
      const resolver = this.variableResolvers[name];
      return (state) => resolver(state);
    }
    if (CONSTANT_NAMES.has(name)) {
      return () => name;
    }
    return warning(`Unknown identifier: ${name}`);
  }

  /**
   * Function calls: target (passed as its AST node) followed by evaluated
   * args, with identifier args passed by name
   */
  compileCall(node) {
    const { name, target, args } = node;

    if (name === "floor") {
      const value = this.compileChild(args[0]);
      return (state) => Math.floor(value(state));
    }

    if (!(name in this.variableResolvers)) {
      return warning(`Unknown function: ${name}`);
    }

    const resolver = this.variableResolvers[name];
    const argFns = args.map((arg) => {
      if (arg.type === "identifier") {
        const argName = arg.name;
        return () => argName;
      }
      return this.compileChild(arg);
    });

    if (!target && argFns.length === 0) {
      return (state) => resolver(state);
    }
    if (!target && argFns.length === 1) {
      const arg = argFns[0];
      return (state) => resolver(state, arg(state));
    }
    if (target && argFns.length === 0) {
      return (state) => resolver(state, target);
    }
    return (state) => {
      const evaluatedArgs = [];
      if (target) {
        evaluatedArgs.push(target);
      }
      for (let i = 0; i < argFns.length; i++) {
        evaluatedArgs.push(argFns[i](state));
      }
      return resolver(state, ...evaluatedArgs);
    };
  }

  compileBinary(node) {
    const { op } = node;
    const left = this.compileChild(node.left);

    // Short-circuit evaluation for logical operators
    if (op === "|") {
      const right = this.compileChild(node.right);
      return (state) => {
        if (left(state)) return true;
        return !!right(state);
      };
    }

    if (op === "&") {
      // If left is a Set, treat & as set membership (backward compat with
      // old format); an identifier on the right is taken by name.
      const rightNode = node.right;
      const rightIsIdentifier = rightNode.type === "identifier";
      const rightName = rightIsIdentifier ? rightNode.name : null;
      const right = rightIsIdentifier ? null : this.compileChild(rightNode);
      const boolRight = rightIsIdentifier ? this.compileChild(rightNode) : right;
      return (state) => {
        const leftVal = left(state);
        if (leftVal && leftVal.has) {
          return leftVal.has(rightIsIdentifier ? rightName : right(state));
        }
        if (!leftVal) return false;
        return !!boolRight(state);
      };
    }

    const right = this.compileChild(node.right);
    switch (op) {
      case "+":
        return (state) => left(state) + right(state);
      case "-":
        return (state) => left(state) - right(state);
      case "*":
        return (state) => left(state) * right(state);
      case "/":
        return (state) => left(state) / right(state);
      case "%":
        return (state) => left(state) % right(state);
      default: {
        const warn = warning(`Unknown binary operator: ${op}`);
        return (state) => {
          left(state);
          right(state);
          return warn();
        };
      }
    }
  }

  compileUnary(node) {
    const { op } = node;
    const operand = this.compileChild(node.operand);

    switch (op) {
      case "!":
        return (state) => !operand(state);
      case "-":
        return (state) => -operand(state);
      default: {
        const warn = warning(`Unknown unary operator: ${op}`);
        return (state) => {
          operand(state);
          return warn();
        };
      }
    }
  }

  compileComparison(node) {
    const { op } = node;
    const left = this.compileChild(node.left);
    const right = this.compileChild(node.right);

    switch (op) {
      case "==":
        return (state) => left(state) == right(state);
      case "!=":
        return (state) => left(state) != right(state);
      case "<":
        return (state) => left(state) < right(state);
      case ">":
        return (state) => left(state) > right(state);
      case "<=":
        return (state) => left(state) <= right(state);
      case ">=":
        return (state) => left(state) >= right(state);
      default: {
        const warn = warning(`Unknown comparison operator: ${op}`);
        return (state) => {
          left(state);
          right(state);
          return warn();
        };
      }
    }
  }
}
