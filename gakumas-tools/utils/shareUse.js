// Tells the server that a visitor who opened a shared link acted on it.
// Once per page load per link, in the background: never throws, never waits.
const sent = new Set();

export function reportShareUse(kind, query) {
  if (!query) return;
  const id = `${kind}?${query}`;
  if (sent.has(id)) return;
  sent.add(id);
  try {
    const body = JSON.stringify({ kind, query });
    fetch("/api/share-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // keepalive lets it finish if the visitor navigates away, up to 64 KB.
      keepalive: body.length < 60_000,
    }).catch(() => {});
  } catch {
    // Nothing to do: the count is best effort.
  }
}
