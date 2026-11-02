import { Customizations, SkillCards } from "gakumas-data";
import { countCustomizations } from "./customizations";

function defined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );
}

function customizedLines(card, c11n, attribute) {
  let lines = card[attribute] || [];
  for (const [id, level] of Object.entries(c11n)) {
    for (const patch of Customizations.getById(id)[attribute] || []) {
      if ((patch.level || 1) != level) continue;
      if (patch.op === "append") lines = lines.concat(patch.effect);
      if (patch.op === "patch") {
        lines = lines.map((line) =>
          line.anchor === patch.anchor
            ? { ...line, ...defined(patch.delta) }
            : line,
        );
      }
    }
  }
  return lines;
}

function growthOf(c11n) {
  const growth = {};
  for (const [id, level] of Object.entries(c11n)) {
    for (const patch of Customizations.getById(id).effects || []) {
      if ((patch.level || 1) != level) continue;
      // Patches that edit an existing effect (op:"patch", e.g. 107 on
      // 一番高い星+) carry a delta instead of an effect.
      if (patch.effect?.phase !== "prestage") continue;
      for (const { lhs, rhs } of patch.effect.actions) {
        const field = lhs.replace(/^g\./, "");
        growth[field] = (growth[field] || 0) + rhs.value;
      }
    }
  }
  return growth;
}

function leadingConstant(rhs) {
  if (rhs.type === "number") return rhs.value;
  if (rhs.type === "binary" && rhs.op === "+") return leadingConstant(rhs.left);
  return null;
}

function constantGains(lines, field) {
  return lines
    .filter((line) => !line.phase && !line.conditions?.length)
    .flatMap((line) => line.actions || [])
    .filter((a) => a.type === "assignment" && a.lhs === field && a.op === "+=")
    .map((a) => leadingConstant(a.rhs))
    .filter((value) => value !== null);
}

const ICONS = {
  goodConditionTurns: "goodCondition",
  goodConditionTurnsMultiplier: "goodCondition",
  setGoodConditionTurnsAdditionBuff: "goodCondition",
  perfectConditionTurns: "perfectCondition",
  concentration: "concentration",
  concentrationMultiplier: "concentration",
  setConcentrationBuff: "concentration",
  setConcentrationEffectBuff: "concentration",
  setConcentrationAdditionBuff: "concentration",
  goodImpressionTurns: "goodImpression",
  setGoodImpressionTurnsBuff: "goodImpression",
  setGoodImpressionTurnsEffectBuff: "goodImpression",
  motivation: "motivation",
  motivationMultiplier: "motivation",
  setMotivationBuff: "motivation",
  setMotivationAdditionBuff: "motivation",
  fullPowerCharge: "fullPower",
  setFullPowerChargeBuff: "fullPower",
  setFullPowerEffectBuff: "fullPower",
  halfCostTurns: "halfCost",
  costReduction: "costReduction",
  cardUsesRemaining: "cardUses",
  drawCard: "draw",
  holdSelected: "deck",
  holdSelectedUpto: "deck",
  holdThisCard: "deck",
  addCardToDeck: "deck",
  addCardToTopOfDeck: "deck",
  moveRandomToTopOfDeck: "deck",
  moveRandomToHand: "deck",
  nullifyDebuff: "nullifyDebuff",
  "setStance:strength": "strength",
  "setStance:preservation": "preservation",
};
const MAX_ICONS = 4;
const SILENT = new Set(["genki", "limit", "ttl", "delay"]);

function actionIcon(action) {
  if (action.type === "assignment") {
    if (action.lhs === "score") {
      return leadingConstant(action.rhs) === null ? "scaling" : null;
    }
    if (SILENT.has(action.lhs) || action.op === "=") return null;
    return ICONS[action.lhs] || `other:${action.lhs}`;
  }
  const name =
    action.name === "setStance"
      ? `setStance:${(action.args[0]?.name ?? action.args[0]?.value ?? "").replace(/\d/g, "")}`
      : action.name;
  return ICONS[name] || `other:${name}`;
}

function lineIcons(line) {
  if (line.phase === "turn") return ["delayed"];
  if (line.phase) return ["lasting"];
  if (line.targets?.length) return ["growth"];
  return [
    ...(line.actions || []).map(actionIcon),
    ...(line.effects || []).flatMap(lineIcons),
  ].filter(Boolean);
}

function growsCards(line) {
  return !!line.targets?.length || (line.effects || []).some(growsCards);
}

function effectIcon(line) {
  return growsCards(line) ? "growth" : "lasting";
}

function costValue(card, growth) {
  const action = (card.cost || [])
    .flatMap((line) => line.actions || [])
    .find((a) => a.op === "-=" && a.rhs.type === "number");
  if (!action) return 0;
  const reduction =
    action.lhs === "cost" ? growth.cost || 0 : growth.typedCost || 0;
  return Math.max(0, action.rhs.value - reduction);
}

export function predictBadges(cardId, c11n = {}) {
  const card = SkillCards.getById(cardId);
  const actions = customizedLines(card, c11n, "actions");
  const growth = growthOf(c11n);
  const score = constantGains(actions, "score");
  const genki = constantGains(actions, "genki");
  return {
    dot: countCustomizations(c11n),
    score: score.length ? score[0] + (growth.score || 0) : null,
    genki: genki.length
      ? genki.reduce((sum, gain) => sum + gain + (growth.genki || 0), 0)
      : null,
    cost: costValue(card, growth),
    icon:
      [...actions.flatMap(lineIcons), ...(card.effects || []).map(effectIcon)]
        .slice(0, MAX_ICONS)
        .at(-1) ?? null,
  };
}

function* combinations(options, total) {
  if (!options.length) {
    if (total === 0) yield {};
    return;
  }
  const [{ id, max }, ...rest] = options;
  for (let level = Math.min(max, total); level >= 0; level--) {
    for (const combo of combinations(rest, total - level)) {
      yield level ? { [id]: level, ...combo } : combo;
    }
  }
}

const RELAXATIONS = [
  [],
  ["score"],
  ["score", "cost"],
  ["score", "cost", "genki"],
];

function fits(cardId, c11n, badges, ignored) {
  const predicted = predictBadges(cardId, c11n);
  return ["score", "genki", "cost"].every(
    (badge) =>
      ignored.includes(badge) ||
      badges[badge] === undefined ||
      predicted[badge] === badges[badge],
  );
}

function iconMismatch(type, shown) {
  if (shown === null) return type === null ? 0 : 1;
  return type === null ? 1 : (shown[type] ?? 1);
}

function closestIcons(cardId, candidates, shown) {
  if (shown === undefined) return candidates;
  const mismatch = candidates.map((c11n) =>
    iconMismatch(predictBadges(cardId, c11n).icon, shown),
  );
  const best = Math.min(...mismatch);
  return candidates.filter((_, i) => mismatch[i] === best);
}

export function customizationCandidates(cardId, badges) {
  const card = SkillCards.getById(cardId);
  if (!card || !badges || badges.dot === 0) return [{}];
  const options = (card.availableCustomizations || [])
    .map(Customizations.getById)
    .filter(Boolean);
  const maxDot = options.reduce((sum, { max }) => sum + max, 0);
  const dots =
    badges.dot === undefined
      ? Array.from({ length: maxDot }, (_, i) => i + 1)
      : [badges.dot];
  const all = dots.flatMap((dot) => [...combinations(options, dot)]);
  for (const ignored of RELAXATIONS) {
    const matching = all.filter((c11n) => fits(cardId, c11n, badges, ignored));
    if (!matching.length) continue;
    return closestIcons(cardId, matching, badges.icon);
  }
  return [{}];
}

export function inferCustomizations(cardId, badges) {
  return customizationCandidates(cardId, badges)[0];
}
