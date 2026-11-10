import { PItems, SkillCards } from "gakumas-data";
import { countCustomizations } from "gakumas-loadout";

export const COST_RANGES = [
  { rank: "SSS+", min: 546, max: 858 },
  { rank: "SSS", min: 546, max: 858 },
  { rank: "SS+", min: 651, max: 858 },
  { rank: "SS", min: 651, max: 804 },
  { rank: "S+", min: 546, max: 741 },
  { rank: "S", min: 546, max: 642 },
  { rank: "A+", min: 441, max: 594 },
  { rank: "A", min: 441, max: 519 },
  { rank: "B+", min: 306, max: 423 },
  { rank: "B", min: 306, max: 363 },
];

export const COST_RANGES_BY_RANK = COST_RANGES.reduce((acc, cur) => {
  acc[cur.rank] = {
    min: cur.min,
    max: cur.max,
  };
  return acc;
}, {});

export function calculateContestPowerBreakdown(
  params,
  pItemIds,
  skillCardIds,
  customizations
) {
  const [vocal, dance, visual, stamina] = params.map((p) => p || 0);
  const paramPower = 3 * (vocal + dance + visual) + 24 * stamina;
  const pItemPower = pItemIds
    .filter((p) => !!p)
    .map(PItems.getById)
    .reduce((acc, cur) => acc + cur.contestPower, 0);
  const skillCardPower = skillCardIds
    .filter((s) => !!s)
    .map(SkillCards.getById)
    .reduce((acc, cur) => acc + cur.contestPower, 0);
  const customizationPower = (customizations || []).reduce(
    (acc, cur) => acc + countCustomizations(cur) * 36,
    0
  );
  return {
    total: paramPower + pItemPower + skillCardPower + customizationPower,
    paramPower,
    pItemPower,
    skillCardPower,
    customizationPower,
  };
}

export function calculateContestPower(
  params,
  pItemIds,
  skillCardIds,
  customizations
) {
  return calculateContestPowerBreakdown(
    params,
    pItemIds,
    skillCardIds,
    customizations
  ).total;
}

export function calculateSkillCardCost(skillCardIds) {
  return skillCardIds
    .filter((s) => !!s)
    .map(SkillCards.getById)
    .reduce(
      (acc, cur) => acc + (cur.sourceType == "pIdol" ? 0 : cur.contestPower),
      0
    );
}
