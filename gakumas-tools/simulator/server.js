import { IdolConfig, IdolStageConfig, StageConfig } from "gakumas-engine";
import { readJsonBody } from "@/utils/apiValidation";
import { isAdmin } from "@/utils/admin";
import { createSimulation } from ".";
import { MAX_CHUNK_SIZE } from "./constants";
import { encodeLine } from "./ndjson";
import { parseSimulationInput } from "./serverInput";

const MAX_BODY_BYTES = 200_000;
const MAX_DURATION_MS = 60_000;

function buildConfig(loadout, stage, enterPercents) {
  return new IdolStageConfig(
    new IdolConfig(loadout),
    new StageConfig(stage),
    enterPercents,
  );
}

function streamRuns(simulation, numRuns, signal) {
  const encoder = new TextEncoder();
  const deadline = performance.now() + MAX_DURATION_MS;
  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      const send = (message) =>
        controller.enqueue(encoder.encode(encodeLine(message)));
      try {
        for (let done = 0; done < numRuns; ) {
          if (cancelled || signal?.aborted) return;
          if (performance.now() > deadline) {
            throw new Error("Simulation took too long");
          }
          const chunk = Math.min(MAX_CHUNK_SIZE, numRuns - done);
          await simulation.run(chunk);
          done += chunk;
          send({ progress: chunk });
          // Yield so other requests are served between chunks.
          await new Promise((resolve) => setImmediate(resolve));
        }
        send({ result: simulation.result() });
      } catch (err) {
        if (cancelled) return;
        send({ error: err?.message || String(err) });
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
}

export async function handleSimulationRequest(request, session) {
  if (!isAdmin(session)) return new Response("Not Found", { status: 404 });

  const { body, error, status } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error) return new Response(error, { status });

  const { input, error: invalid } = parseSimulationInput(body);
  if (invalid) return new Response(invalid, { status: 400 });
  const { loadout, loadouts, stage, enterPercents, numRuns } = input;

  let simulation;
  try {
    simulation = createSimulation(
      buildConfig(loadout, stage, enterPercents),
      loadouts?.map((ld) => buildConfig(ld, stage, enterPercents)) ?? null,
      "HeuristicStrategy",
    );
  } catch {
    return new Response("Invalid loadout", { status: 400 });
  }

  return new Response(streamRuns(simulation, numRuns, request.signal), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
