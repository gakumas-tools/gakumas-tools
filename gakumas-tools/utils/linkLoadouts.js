// Link phases share the stage and Vo/Da/Vi; each keeps its own stamina,
// deck, items and support bonus.
export function synchronizeLinkLoadouts(loadouts, loadout, index, phaseCount) {
  const activeIndex = Math.min(index, phaseCount - 1);
  return Array.from({ length: phaseCount }, (_, i) => {
    const phase = i == activeIndex ? loadout : loadouts[i] || loadout;
    return {
      ...phase,
      stageId: loadout.stageId,
      customStage: loadout.customStage,
      params: [...loadout.params.slice(0, 3), phase.params[3]],
    };
  });
}
