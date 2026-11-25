// What the memory calculator's skill card pickers may offer. The rules come
// from in-game captures, pinned by tests/unit/gakumas-tools/utils/memoryPickerFilters.test.mjs.

// A target is a card that can land in a memory through its lottery. The
// P-idol's own unique card is always in the memory, so it is never a target.
// Whether another P-idol's unique card, taken from a draft, can be drawn into
// a memory is not yet captured, so targets leave out every unique card.
export const TARGET_FILTER = {
  callback: (e) => e.sourceType != "pIdol",
};

// A draft during a produce offers produce cards and, as 活動支給 shows
// (tests/fixtures/draft/07.png), other P-idols' unique cards.
export const DRAFT_FILTER = {
  callback: (e) => e.sourceType == "produce" || e.sourceType == "pIdol",
};

// An acquired card is anything a produce can hand you: the starting deck,
// support events, and any card a draft offers.
export const ACQUIRED_FILTER = {
  callback: (e) =>
    e.sourceType == "default" ||
    e.sourceType == "support" ||
    DRAFT_FILTER.callback(e),
};
