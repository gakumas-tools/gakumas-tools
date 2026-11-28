// Weekly counts of steps players take on the site, to see where a flow loses
// them. Counts only: no ids, no pseudonyms, nothing about who.
export const FEATURE_USE = "featureUse";

// The steps of sharing a rehearsal comparison (goal: more shared), in order.
export const FEATURE_EVENTS = [
  "rehearsalTabOpened",
  "rehearsalResultsAdded",
  "rehearsalCellPicked",
  "rehearsalShared",
];

/** The ISO week of a date, as "2026-W48". */
export function isoWeek(date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Thursday of this week decides its year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The update that counts one event in its week, or null for an unknown event. */
export function featureUseWrite(event, now) {
  if (!FEATURE_EVENTS.includes(event)) return null;
  const week = isoWeek(now);
  return {
    filter: { _id: `${week}:${event}` },
    update: { $inc: { n: 1 }, $setOnInsert: { week, event } },
  };
}
