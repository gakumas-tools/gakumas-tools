import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  resetRand,
} from "gakumas-engine";
import { Stages } from "gakumas-data";
import { createSimulation } from "../../../../gakumas-tools/simulator/index.js";
import { decodeLine } from "../../../../gakumas-tools/simulator/ndjson.js";
import { handleSimulationRequest } from "../../../../gakumas-tools/simulator/server.js";
import { loadoutFromQuery } from "../../../lib.mjs";

const OWNER = "111111111111111111";
const loadout = loadoutFromQuery(
  "stage=95&support_bonus=0.04&params=1246-3942-798-36&items=132-82-53&cards=1-307-784-777-175-398_535-253-801-265-281-91&customizations=-e33x1---e7x1-_-e27x1e36x1----",
);
const stage = Stages.getById(loadout.stageId);

beforeEach(() => {
  process.env.ADMIN_DISCORD_IDS = OWNER;
});

function simulateRequest(session, body = { loadout, stage, numRuns: 20 }) {
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return handleSimulationRequest(request, session);
}

// JSON drops undefined-valued keys; reading them back still gives undefined.
function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, withoutUndefined(v)]),
  );
}

async function readMessages(response) {
  const text = await response.text();
  return text.trim().split("\n").map(decodeLine);
}

test("rejects anyone who isn't an admin with 404", async () => {
  for (const session of [
    null,
    { user: {} },
    { user: { id: "222222222222222222" } },
  ]) {
    assert.equal((await simulateRequest(session)).status, 404);
  }
});

test("rejects everyone when no admin is configured", async () => {
  delete process.env.ADMIN_DISCORD_IDS;
  assert.equal((await simulateRequest({ user: { id: OWNER } })).status, 404);
  assert.equal((await simulateRequest({ user: { id: undefined } })).status, 404);
});

test("rejects out-of-range run counts from an admin", async () => {
  for (const numRuns of [0, 10001, 1.5, "100"]) {
    const response = await simulateRequest(
      { user: { id: OWNER } },
      { loadout, stage, numRuns },
    );
    assert.equal(response.status, 400);
  }
});

test("streams the same result a browser worker produces for the same seed", async () => {
  const numRuns = 150;

  resetRand(42);
  const config = new IdolStageConfig(
    new IdolConfig(loadout),
    new StageConfig(stage),
    false,
  );
  const workerSimulation = createSimulation(
    structuredClone(config),
    null,
    "HeuristicStrategy",
  );
  await workerSimulation.run(numRuns);
  const workerResult = workerSimulation.result();

  resetRand(42);
  const response = await simulateRequest(
    { user: { id: OWNER } },
    { loadout, stage, enterPercents: false, numRuns },
  );
  assert.equal(response.status, 200);
  const messages = await readMessages(response);
  const progress = messages.filter((m) => m.progress);
  assert.equal(
    progress.reduce((sum, m) => sum + m.progress, 0),
    numRuns,
  );
  assert.deepEqual(messages.at(-1).result, withoutUndefined(workerResult));
});
