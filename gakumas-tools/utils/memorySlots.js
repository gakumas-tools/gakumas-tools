import { getMemoryParamContribution } from "@/utils/stamina";

export function setMemorySlot(
  { params, slots },
  index,
  memoryParams,
  multiplier,
) {
  const base = slots.some((s) => s)
    ? params.map(
        (p, i) =>
          (p || 0) - getMemoryParamContribution(slots[index]?.[i], multiplier),
      )
    : [0, 0, 0, 0];
  const nextSlots = [...slots];
  nextSlots[index] = memoryParams;
  return {
    params: base.map(
      (p, i) => p + getMemoryParamContribution(memoryParams[i], multiplier),
    ),
    slots: nextSlots,
  };
}
