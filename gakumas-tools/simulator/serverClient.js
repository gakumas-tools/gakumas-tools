import { decodeLine } from "./ndjson";

const SERVER_FLAG_KEY = "gakumas-tools.simulator.server";

export function serverSimulationEnabled() {
  try {
    return localStorage.getItem(SERVER_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

// Resolves null when the server refuses, so the caller can fall back to workers.
export async function runOnServer(
  { loadout, loadouts, stage, enterPercents, numRuns },
  onProgress,
  signal,
) {
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loadout, loadouts, stage, enterPercents, numRuns }),
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());

  let buffered = "";
  for await (const text of response.body.pipeThrough(new TextDecoderStream())) {
    buffered += text;
    const lines = buffered.split("\n");
    buffered = lines.pop();
    for (const line of lines) {
      const message = decodeLine(line);
      if (message.error) throw new Error(message.error);
      if (message.progress) onProgress(message.progress);
      if (message.result) return [message.result];
    }
  }
  throw new Error("Server simulation ended without a result");
}
