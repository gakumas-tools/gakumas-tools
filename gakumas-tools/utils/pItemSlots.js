// P-item slots in a loadout. A contest stage takes 4 P-items. A produce
// exam takes every P-item the produce holds (the P-idol's, each support
// card's, the ones picked along the way), so its slots grow: there is
// always one empty slot after the last filled one, up to MAX_PRODUCE_SLOTS.
export const STAGE_SLOTS = 4;
export const MAX_PRODUCE_SLOTS = 12;

export function fitPItemSlots(pItemIds, produceExam) {
  let filled = 0;
  pItemIds.forEach((id, i) => {
    if (id) filled = i + 1;
  });
  const length = produceExam
    ? Math.min(Math.max(STAGE_SLOTS, filled + 1), Math.max(MAX_PRODUCE_SLOTS, filled))
    : Math.max(STAGE_SLOTS, filled);
  if (length == pItemIds.length) return pItemIds;
  if (length < pItemIds.length) return pItemIds.slice(0, length);
  return pItemIds.concat(new Array(length - pItemIds.length).fill(0));
}

// Produce P-items (picked during a produce, e.g. はつぼしキーホルダー) are
// held only in a produce exam, never in a contest loadout.
export function pickablePItem(pItem, produceExam) {
  return produceExam || pItem.sourceType != "produce";
}
