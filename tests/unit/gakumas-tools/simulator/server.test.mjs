import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  resetRand,
} from "gakumas-engine";
import { Customizations, SkillCards, Stages } from "gakumas-data";
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

function simulateRequest(session, body = { loadout, numRuns: 20 }) {
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
      { loadout, numRuns },
    );
    assert.equal(response.status, 400);
  }
});

function withCustomizations(customizations) {
  const customizationGroups = structuredClone(loadout.customizationGroups);
  customizationGroups[0][1] = customizations;
  return { ...loadout, customizationGroups };
}

test("rejects input a browser run couldn't produce", async () => {
  const linkStage = Stages.getAll().find((s) => s.type == "linkContest");
  const { availableCustomizations } = SkillCards.getById(
    loadout.skillCardIdGroups[0][1],
  );
  const unavailable = Customizations.getAll().find(
    (c) => !availableCustomizations.includes(String(c.id)),
  ).id;
  const available = availableCustomizations[0];
  const overMax = Customizations.getById(available).max + 1;

  const cases = {
    "custom stage": { ...loadout, stageId: "custom" },
    "unknown stage": { ...loadout, stageId: 999999 },
    "unknown skill card": {
      ...loadout,
      skillCardIdGroups: [[...loadout.skillCardIdGroups[0], 99999999]],
    },
    "unknown p-item": { ...loadout, pItemIds: [99999999] },
    "out-of-range param": { ...loadout, params: [1e9, 0, 0, 0] },
    "too many cards": {
      ...loadout,
      skillCardIdGroups: [new Array(13).fill(1)],
    },
    "customization not on the card": withCustomizations({ [unavailable]: 1 }),
    "customization over its max": withCustomizations({ [available]: overMax }),
  };
  for (const [name, bad] of Object.entries(cases)) {
    const response = await simulateRequest(
      { user: { id: OWNER } },
      { loadout: bad, stage, numRuns: 20 },
    );
    assert.equal(response.status, 400, name);
  }

  const extraLoadouts = await simulateRequest(
    { user: { id: OWNER } },
    { loadout, loadouts: [loadout], stage, numRuns: 20 },
  );
  assert.equal(extraLoadouts.status, 400, "loadouts on a non-link stage");

  const linkLoadout = { ...loadout, stageId: linkStage.id };
  const missingLoadouts = await simulateRequest(
    { user: { id: OWNER } },
    {
      loadout: linkLoadout,
      loadouts: [linkLoadout],
      stage: linkStage,
      numRuns: 20,
    },
  );
  assert.equal(missingLoadouts.status, 400, "too few link loadouts");
});

test("accepts a slot whose card was just picked", async () => {
  const response = await simulateRequest(
    { user: { id: OWNER } },
    { loadout: withCustomizations([]), numRuns: 1 },
  );
  assert.equal(response.status, 200);
});

test("ignores a stage sent by the client", async () => {
  const response = await simulateRequest(
    { user: { id: OWNER } },
    { loadout, stage: { id: "custom", turnCounts: { vocal: 1e9 } }, numRuns: 1 },
  );
  assert.equal(response.status, 200);
  const messages = await readMessages(response);
  assert.ok(messages.at(-1).result);
});

test("stops with an error once a run passes its time budget", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => (now += 30_000));
  const response = await simulateRequest(
    { user: { id: OWNER } },
    { loadout, numRuns: 1000 },
  );
  const messages = await readMessages(response);
  assert.equal(messages.at(-1).error, "Simulation took too long");
  assert.ok(messages.filter((m) => m.progress).length < 10);
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
    { loadout, enterPercents: false, numRuns },
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
