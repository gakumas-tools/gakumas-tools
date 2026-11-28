// Counts a step a visitor took (see utils/featureUse.js), once per page load
// per step, in the background: never throws, never waits.
const sent = new Set();

export function countUse(event) {
  if (sent.has(event)) return;
  sent.add(event);
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
