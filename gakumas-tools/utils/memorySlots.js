import { SkillCards } from "gakumas-data";
import { fixCardCustomizations } from "@/utils/customizations";
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

// One entry per card slot: LoadoutContext indexes customizations as one flat
// list cut into groups of 6. Memories saved before customizations existed have
// none, and a short group would shift every later group's customizations.
// Each slot keeps only what its card can have: the memory editor used to keep
// a slot's customizations when its card changed, and the engine applies
// whatever it is given.
export function getMemorySlotCustomizations(memory) {
  return Array.from({ length: 6 }, (_, i) =>
    fixCardCustomizations(memory.skillCardIds?.[i], memory.customizations?.[i]),
  );
}
