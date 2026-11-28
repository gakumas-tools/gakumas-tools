// Counts a step a visitor took (see utils/featureUse.js), once per page load
// per step, in the background: never throws, never waits.
const sent = new Set();

export function countUse(event) {
  if (sent.has(event)) return;
  sent.add(event);
  send(event);
}

function send(event) {
  try {
    fetch("/api/feature-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing to do: the count is best effort.
  }
}

/**
 * Counts `event` at most once a month in this browser (UTC month, kept in
 * localStorage), so the month's total is how many browsers did it. Without
 * storage it doesn't count, so a count never runs high.
 */
export function countMonthly(event, now = new Date(), storage) {
  try {
    const store = storage ?? window.localStorage;
    const key = `countedMonth:${event}`;
    const month = now.toISOString().slice(0, 7);
    if (store.getItem(key) === month) return false;
    store.setItem(key, month);
  } catch {
    return false;
  }
  send(event);
  return true;
}
