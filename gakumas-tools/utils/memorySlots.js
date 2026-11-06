import { SkillCards } from "gakumas-data";
import { getMemoryParamContribution } from "@/utils/stamina";

// A memory's skill cards without its empty slots. Customizations are stored
// by slot, so each card keeps the slot it came from.
export function getFilledSkillCardSlots(skillCardIds) {
  return skillCardIds
    .map((id, slot) => ({ skillCard: SkillCards.getById(id), slot }))
    .filter(({ skillCard }) => skillCard);
}

export function setMemorySlot(
  { params, slots },
  index,
  memoryParams,
  multiplier,
) {
  const base = slots.some((s) => s)
    ? params.map((p, i) => (p || 0) - (slots[index]?.[i] || 0))
    : [0, 0, 0, 0];
  const contribution = [0, 1, 2, 3].map((i) =>
    getMemoryParamContribution(memoryParams[i], multiplier),
  );
  const nextSlots = [...slots];
  nextSlots[index] = contribution;
  return {
    params: base.map((p, i) => p + contribution[i]),
    slots: nextSlots,
  };
}
