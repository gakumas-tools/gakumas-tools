import { SkillCards } from "gakumas-data";
import {
  calculateSkillCardCost,
  COST_RANGES_BY_RANK,
} from "@/utils/contestPower";

function generateCombinations(cards, length) {
  const combinations = [];
  const combination = [];
  function extend(start) {
    if (combination.length == length) {
      combinations.push([...combination]);
      return;
    }
    const lastStart = cards.length - (length - combination.length);
    for (let i = start; i <= lastStart; i++) {
      combination.push(cards[i]);
      extend(i + 1);
      combination.pop();
    }
  }
  extend(0);
  return combinations;
}

export function generatePossibleMemories(skillCardIds, rank) {
  // Get cost range based on rank
  const { min: minCost, max: maxCost } = COST_RANGES_BY_RANK[rank];

  // Get skill card data from ids
  const skillCards = [...new Set(skillCardIds.filter((id) => id))].map(
    SkillCards.getById
  );

  // Separate skill cards by support/produce
  let supportSkillCards = [];
  let produceSkillCards = [];
  for (let card of skillCards) {
    if (card.sourceType == "produce") {
      produceSkillCards.push(card);
    } else if (
      card.sourceType == "support" &&
      !skillCards.find((other) => other.name == `${card.name}+`)
    ) {
      supportSkillCards.push(card);
    }
  }
  produceSkillCards.sort((a, b) => b.contestPower - a.contestPower);

  // Generate initial combinations of support cards (up to 1)
  let preLotteryCombinations = [];
  if (!supportSkillCards.length) {
    preLotteryCombinations.push([]);
  }
  for (let supportSkillCard of supportSkillCards) {
    preLotteryCombinations.push([supportSkillCard]);
  }

  // Generate combinations of remaining cards for each support card chosen
  let fullCombinations = [];
  for (let preLotteryCombination of preLotteryCombinations) {
    // Number of lottery slots is up to 5 or 4 depending on whether a support card is selected
    // or the number of produce cards acquired if less than that
    const lotterySlots = Math.min(
      5 - preLotteryCombination.length,
      produceSkillCards.length
    );

    // Reduce number of lottery slots until we find a viable combination
    // or we reach 0 slots
    let hasOverCostCombination = false;
    let remainingSlots = lotterySlots;
    let subCombinations = [];
    while (true) {
      // If no possible combinations, add lonely memory
      if (remainingSlots == 0) {
        break;
      }

      // Generate all combinations based on remaining slots, with their costs
      const costedCombinations = [];
      const combinations = generateCombinations(
        produceSkillCards,
        remainingSlots
      );
      for (let combination of combinations) {
        // Remove combinations that contain upgraded and non-upgraded version of the same card
        const names = combination.map((c) => c.name);
        if (names.some((name) => names.includes(`${name}+`))) {
          continue;
        }

        // Calculate cost of this combination
        const fullCombination = preLotteryCombination.concat(combination);
        const combinationCost = calculateSkillCardCost(
          fullCombination.map(({ id }) => id)
        );

        // Remove combinations that cost too much
        if (combinationCost > maxCost) {
          hasOverCostCombination = true;
          continue;
        }

        costedCombinations.push({ combination: fullCombination, combinationCost });
      }

      // Keep the combinations within cost range. If there are none, then if
      // there is a combination higher than max cost, keep all combinations
      // lower than min cost. Otherwise, keep only the highest cost ones.
      const inRange = costedCombinations.filter(
        ({ combinationCost }) => combinationCost >= minCost
      );
      const hasInRangeCostCombination = inRange.length > 0;
      let kept = inRange;
      if (!hasInRangeCostCombination) {
        const maxCombinedCost = Math.max(
          ...costedCombinations.map(({ combinationCost }) => combinationCost)
        );
        kept = hasOverCostCombination
          ? costedCombinations
          : costedCombinations.filter(
              ({ combinationCost }) => combinationCost === maxCombinedCost
            );
      }
      const stepCombinations = kept.map(({ combination }) => combination);

      // If we found in-range combinations at the current number of slots, end the lottery
      if (hasInRangeCostCombination) {
        subCombinations = stepCombinations.map((combination) => ({
          skillCards: combination,
          probability:
            1 / preLotteryCombinations.length / stepCombinations.length,
        }));
        break;
      }

      // If we found out-of-range combinations at the current number of slots
      // And none for higher numbers, set to current step
      if (stepCombinations.length && !subCombinations.length) {
        subCombinations = stepCombinations.map((combination) => ({
          skillCards: combination,
          probability:
            1 / preLotteryCombinations.length / stepCombinations.length,
        }));
      }

      // Reduce the number of slots
      remainingSlots--;
    }

    if (!subCombinations.length) {
      subCombinations.push({
        skillCards: preLotteryCombination,
        probability: 1 / preLotteryCombinations.length,
      });
    }

    fullCombinations = fullCombinations.concat(subCombinations);
  }

  return fullCombinations.map(({ skillCards, probability }) => ({
    skillCardIds: skillCards.map(({ id }) => id),
    probability,
  }));
}

function generateTargetCombinations(slots) {
  if (slots.length === 0) return [[]];
  const restCombos = generateTargetCombinations(slots.slice(1));
  return slots[0].reduce((acc, cur) => {
    for (let c of restCombos) {
      if (c.includes(cur)) continue;
      acc.push(c.concat(cur));
    }
    return acc;
  }, []);
}

export function classifyMemories(
  possibleMemories,
  { targetSkillCardIds, alternateSkillCardIds, targetNegations },
) {
  let positiveSlots = [];
  let negativeSlots = [];
  for (let i in targetSkillCardIds) {
    const slot = [targetSkillCardIds[i]]
      .concat(alternateSkillCardIds[i] || [])
      .filter((id) => id);
    if (!slot.length) continue;
    if (targetNegations[i]) {
      negativeSlots.push(slot);
    } else {
      positiveSlots.push(slot);
    }
  }
  const excludedSkillCardIds = [].concat(...negativeSlots);
  const matchingCombinations = generateTargetCombinations(positiveSlots);

  return possibleMemories.reduce(
    (acc, cur) => {
      const memoryIsOnTarget =
        matchingCombinations.some((combo) =>
          combo.every((id) => cur.skillCardIds.includes(id)),
        ) &&
        !cur.skillCardIds.some((id) => excludedSkillCardIds.includes(id));

      if (memoryIsOnTarget) {
        acc.onTargetMemories.push(cur);
        acc.onTargetProbability += cur.probability;
      } else {
        acc.offTargetMemories.push(cur);
        acc.offTargetProbability += cur.probability;
      }

      return acc;
    },
    {
      onTargetMemories: [],
      offTargetMemories: [],
      onTargetProbability: 0,
      offTargetProbability: 0,
    },
  );
}
