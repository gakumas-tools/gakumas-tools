/**
 * Card Targeting
 *
 * Evaluates target expressions to find matching cards.
 * Supports boolean operators (AND, OR, NOT) and various card filters.
 */
import { SkillCards } from "gakumas-data";
import { S } from "../../constants";

// Whether a cardMap index is one of the current idol's cards. In a link
// contest, cardMap also holds the other idols' cards, which aren't in play.
function isPhaseCard(state, k) {
  return (
    (k >= state[S.phaseCardsStart] && k < state[S.phaseCardsEnd]) ||
    k >= state[S.phaseAddedCardsStart]
  );
}

/**
 * Get cards matching a target rule
 * @param {Object} state - Game state
 * @param {Object|string} targetRule - Target rule (AST node or string)
 * @param {Object} source - Source context for 'this' target
 * @param {Function} getCardEffects - Function to get card effects
 * @param {Function} getCardCosts - Function to get card costs
 * @param {Function} getCardRarity - Function to get card rarity
 * @returns {Set} Set of matching card indices
 */
export function getTargetRuleCards(
  state,
  targetRule,
  source,
  getCardEffects,
  getCardCosts,
  getCardRarity
) {
  // Handle AST nodes
  if (targetRule && typeof targetRule === "object") {
    return evaluateTargetAST(state, targetRule, source, getCardEffects, getCardCosts, getCardRarity);
  }

  // Handle simple string identifier (fallback for direct calls)
  if (typeof targetRule === "string") {
    return getTargetCards(state, targetRule, source, getCardRarity);
  }

  return new Set();
}

/**
 * Evaluate a target expression AST node
 */
function evaluateTargetAST(state, node, source, getCardEffects, getCardCosts, getCardRarity) {
  switch (node.type) {
    case "binary": {
      const left = evaluateTargetAST(state, node.left, source, getCardEffects, getCardCosts, getCardRarity);
      const right = evaluateTargetAST(state, node.right, source, getCardEffects, getCardCosts, getCardRarity);
      if (node.op === "&") {
        // Intersection
        const result = new Set();
        for (let card of left) {
          if (right.has(card)) result.add(card);
        }
        return result;
      } else if (node.op === "|") {
        // Union
        const result = new Set(left);
        for (let card of right) result.add(card);
        return result;
      }
      return new Set();
    }

    case "unary": {
      if (node.op === "!") {
        // Complement (relative to all cards)
        const operand = evaluateTargetAST(state, node.operand, source, getCardEffects, getCardCosts, getCardRarity);
        const result = new Set();
        for (let k = 0; k < state[S.cardMap].length; k++) {
          if (!isPhaseCard(state, k)) continue;
          if (!operand.has(k)) result.add(k);
        }
        return result;
      }
      return new Set();
    }

    case "call": {
      const name = node.name;
      const args = node.args;
      if (name === "effect" && args.length > 0) {
        const effectName =
          args[0].type === "identifier" ? args[0].name : String(args[0].value);
        const result = new Set();
        for (let k = 0; k < state[S.cardMap].length; k++) {
          if (!isPhaseCard(state, k)) continue;
          if (getCardEffects(state, k).has(effectName)) {
            result.add(k);
          }
        }
        return result;
      }
      if (name === "cost" && args.length > 0) {
        const costName =
          args[0].type === "identifier" ? args[0].name : String(args[0].value);
        const result = new Set();
        for (let k = 0; k < state[S.cardMap].length; k++) {
          if (!isPhaseCard(state, k)) continue;
          if (getCardCosts(state, k).has(costName)) {
            result.add(k);
          }
        }
        return result;
      }
      if (name === "baseId" && args.length > 0) {
        const wantId = args[0].type === "number" ? args[0].value : parseInt(args[0].name, 10);
        const result = new Set();
        for (let k = 0; k < state[S.cardMap].length; k++) {
          if (!isPhaseCard(state, k)) continue;
          if (state[S.cardMap][k].baseId == wantId) result.add(k);
        }
        return result;
      }
      if (name === "id" && args.length > 0) {
        const wantId = args[0].type === "number" ? args[0].value : parseInt(args[0].name, 10);
        const result = new Set();
        for (let k = 0; k < state[S.cardMap].length; k++) {
          if (!isPhaseCard(state, k)) continue;
          if (state[S.cardMap][k].id == wantId) result.add(k);
        }
        return result;
      }
      console.warn(`Unknown target function: ${name}`);
      return new Set();
    }

    case "identifier":
      return getTargetCards(state, node.name, source, getCardRarity);

    case "number":
      return getTargetCards(state, String(node.value), source, getCardRarity);

    default:
      console.warn("Unknown target AST node type:", node.type);
      return new Set();
  }
}

/**
 * Get cards matching a simple target identifier
 */
function getTargetCards(state, target, source, getCardRarity) {
  let targetCards = new Set();

  // Location-based targets
  if (target === "this") {
    if (!source || !("idx" in source)) {
      console.warn("Growth target not found");
    } else {
      targetCards.add(source.idx);
    }
  } else if (target === "hand") {
    for (let k = 0; k < state[S.handCards].length; k++) {
      targetCards.add(state[S.handCards][k]);
    }
  } else if (target === "deck") {
    for (let k = 0; k < state[S.deckCards].length; k++) {
      targetCards.add(state[S.deckCards][k]);
    }
  } else if (target === "discarded") {
    for (let k = 0; k < state[S.discardedCards].length; k++) {
      targetCards.add(state[S.discardedCards][k]);
    }
  } else if (target === "held") {
    for (let k = 0; k < state[S.heldCards].length; k++) {
      targetCards.add(state[S.heldCards][k]);
    }
  } else if (target === "removed") {
    for (let k = 0; k < state[S.removedCards].length; k++) {
      targetCards.add(state[S.removedCards][k]);
    }
  } else if (target === "all") {
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      targetCards.add(k);
    }
  }
  // Type-based targets
  else if (["active", "mental", "trouble"].includes(target)) {
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      if (SkillCards.getById(state[S.cardMap][k].id).type === target) {
        targetCards.add(k);
      }
    }
  } else if (target === "basic") {
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      if (SkillCards.getById(state[S.cardMap][k].id).name.includes("基本")) {
        targetCards.add(k);
      }
    }
  } else if (target === "pIdol") {
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      if (SkillCards.getById(state[S.cardMap][k].id).sourceType === "pIdol") {
        targetCards.add(k);
      }
    }
  }
  // Rarity-based targets
  else if (["T", "N", "R", "SR", "SSR", "L"].includes(target)) {
    const rarity = target;
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      if (getCardRarity(state, k) === rarity) {
        targetCards.add(k);
      }
    }
  }
  // Card ID-based target
  else if (/^\d+$/.test(target)) {
    for (let k = 0; k < state[S.cardMap].length; k++) {
      if (!isPhaseCard(state, k)) continue;
      if (state[S.cardMap][k].baseId == target) {
        targetCards.add(k);
      }
    }
  }

  return targetCards;
}
