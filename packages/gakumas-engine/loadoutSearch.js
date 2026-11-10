import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  PItems,
  SkillCards,
} from "gakumas-data";
import { IdolConfig } from "./config";
import { playScores, stageConfigFor } from "./play";
import { getBaseId, isUniqueCard } from "./utils";

function signaturePIdolId(entity) {
  return entity?.sourceType == "pIdol" ? entity.pIdolId : null;
}

export function loadoutProblems({ skillCardIdGroups, pItemIds }) {
  const problems = [];

  const uniqueBaseIds = new Set();
  for (const id of skillCardIdGroups.flat().filter(Boolean)) {
    const card = SkillCards.getById(id);
    if (!isUniqueCard(card)) continue;
    const baseId = getBaseId(card);
    if (uniqueBaseIds.has(baseId)) {
      problems.push(`Unique skill card ${id} is in the deck twice.`);
    }
    uniqueBaseIds.add(baseId);
  }

  const items = pItemIds.filter(Boolean);
  if (new Set(items).size != items.length) {
    problems.push("A P-item is in the loadout twice.");
  }

  const pIdolIds = new Set();
  for (const [i, group] of skillCardIdGroups.entries()) {
    const groupPIdolIds = new Set(
      group
        .filter(Boolean)
        .map((id) => signaturePIdolId(SkillCards.getById(id)))
        .filter((pIdolId) => pIdolId != null),
    );
    if (groupPIdolIds.size > 1) {
      problems.push(`Memory ${i + 1} has signature cards of two p-idols.`);
    }
    groupPIdolIds.forEach((pIdolId) => pIdolIds.add(pIdolId));
  }
  for (const id of items) {
    const pIdolId = signaturePIdolId(PItems.getById(id));
    if (pIdolId != null) pIdolIds.add(pIdolId);
  }
  if (pIdolIds.size > skillCardIdGroups.length) {
    problems.push(
      `Signatures come from ${pIdolIds.size} p-idols but there are ${skillCardIdGroups.length} memories.`,
    );
  }

  return problems;
}

function planOf(stage, loadout) {
  if (stage.plan != "free") return stage.plan;
  return new IdolConfig({ ...loadout, params: [] }).plan;
}

export function defaultPools(stage, loadout) {
  const plan = planOf(stage, loadout);
  const fits = (entity) =>
    !plan || entity.plan == plan || entity.plan == "free";
  return {
    cardPool: SkillCards.getAll()
      .filter((card) => card.upgraded && fits(card))
      .filter((card) => card.sourceType != "default")
      .filter((card) => !HIDDEN_CARD_IDS.has(card.id))
      .map((card) => card.id),
    pItemPool: PItems.getAll()
      .filter((item) => item.mode == "stage" && fits(item))
      .filter((item) => !HIDDEN_ITEM_IDS.has(item.id))
      .map((item) => item.id),
  };
}

function compositionKey({ skillCardIdGroups, pItemIds }) {
  const sorted = (ids) => ids.filter(Boolean).sort((a, b) => a - b);
  return `${skillCardIdGroups.map(sorted).join("|")}/${sorted(pItemIds)}`;
}

function mean(scores) {
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export async function optimizeLoadout({
  stage,
  loadout,
  cardPool,
  pItemPool,
  seed,
  runs,
  holdoutRuns,
  deadline = Infinity,
  maxPasses = Infinity,
  signal,
  tick = () => {},
  onImprovement = () => {},
}) {
  const evaluated = new Map();
  let evaluations = 0;

  async function evaluate(candidate) {
    const key = compositionKey(candidate);
    if (!evaluated.has(key)) {
      const scores = await playScores(stageConfigFor(stage, candidate), null, {
        seed,
        runs,
        signal,
        tick,
      });
      evaluated.set(key, mean(scores));
      evaluations++;
    }
    return evaluated.get(key);
  }

  const openCardSlots = [];
  loadout.skillCardIdGroups.forEach((group, i) =>
    group.forEach((id, j) => {
      if (!id) openCardSlots.push([i, j]);
    }),
  );
  const openItemSlots = [];
  loadout.pItemIds.forEach((id, i) => {
    if (!id) openItemSlots.push(i);
  });

  let best = structuredClone(loadout);
  let bestMean = await evaluate(best);
  const improvements = [];
  let passes = 0;
  let converged = false;
  let timedOut = false;

  function withCard([i, j], id) {
    const next = structuredClone(best);
    next.skillCardIdGroups[i][j] = id;
    return next;
  }

  function withItem(i, id) {
    const next = structuredClone(best);
    next.pItemIds[i] = id;
    return next;
  }

  const moves = () => [
    ...openCardSlots.map((slot) => ({
      slot: { group: slot[0], index: slot[1] },
      current: () => best.skillCardIdGroups[slot[0]][slot[1]],
      candidates: [0, ...cardPool],
      apply: (id) => withCard(slot, id),
    })),
    ...openItemSlots.map((i) => ({
      slot: { pItem: i },
      current: () => best.pItemIds[i],
      candidates: [0, ...pItemPool],
      apply: (id) => withItem(i, id),
    })),
  ];

  search: while (passes < maxPasses) {
    passes++;
    let improved = false;
    for (const move of moves()) {
      for (const id of move.candidates) {
        if (Date.now() > deadline) {
          timedOut = true;
          break search;
        }
        const from = move.current();
        if (id == from) continue;
        const candidate = move.apply(id);
        if (loadoutProblems(candidate).length) continue;
        const candidateMean = await evaluate(candidate);
        if (candidateMean > bestMean) {
          best = candidate;
          bestMean = candidateMean;
          improved = true;
          const improvement = { ...move.slot, from, to: id, mean: bestMean };
          improvements.push(improvement);
          await onImprovement(improvement);
        }
      }
    }
    if (!improved) {
      converged = true;
      break;
    }
  }

  const holdoutScores = await playScores(stageConfigFor(stage, best), null, {
    seed: seed + runs,
    runs: holdoutRuns,
    signal,
    tick,
  });

  return {
    loadout: best,
    searchMean: bestMean,
    holdout: {
      seed: (seed + runs) >>> 0,
      runs: holdoutRuns,
      mean: mean(holdoutScores),
      min: Math.min(...holdoutScores),
      max: Math.max(...holdoutScores),
    },
    improvements,
    evaluations,
    passes,
    converged,
    timedOut,
  };
}
