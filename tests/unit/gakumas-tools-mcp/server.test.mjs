import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
  resetRand,
} from "gakumas-engine";
import { createMcpServer } from "../../../packages/gakumas-tools-mcp/server.js";
import { loadSuite, loadoutFromQuery } from "../../lib.mjs";

const require = createRequire(
  new URL("../../../packages/gakumas-tools-mcp/package.json", import.meta.url),
);
const { Client } = await import(
  require.resolve("@modelcontextprotocol/sdk/client/index.js")
);
const { InMemoryTransport } = await import(
  require.resolve("@modelcontextprotocol/sdk/inMemory.js")
);
const { StdioClientTransport } = await import(
  require.resolve("@modelcontextprotocol/sdk/client/stdio.js")
);

async function connect(t) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: "test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, result.content[0].text);
  return result.structuredContent;
}

function loadout(suiteId = "seed1-002", extra = {}) {
  const { query } = loadSuite().find((entry) => entry.id == suiteId);
  return { ...loadoutFromQuery(query), seed: 12345, runs: 3, ...extra };
}

async function directScores({ seed, runs, ...loadout }) {
  const scores = [];
  for (let i = 0; i < runs; i++) {
    resetRand((seed + i) >>> 0);
    const config = new IdolStageConfig(
      new IdolConfig(structuredClone(loadout)),
      new StageConfig(Stages.getById(loadout.stageId)),
      loadout.enterPercents,
    );
    const engine = new StageEngine(config);
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;
    scores.push((await new StagePlayer(engine, strategy).play()).score);
  }
  return scores;
}

function linkLoadout(stageId = 121, extra = {}) {
  const decks = [
    [15, 17, 1, 13],
    [19, 21, 13, 9],
    [370, 376, 13, 374],
  ];
  return {
    stageId,
    params: [1000, 800, 600],
    phases: decks.map((cardIds, i) => ({
      stamina: 50 + i * 5,
      skillCardIdGroups: [cardIds],
    })),
    seed: 0xffffffff,
    runs: 3,
    ...extra,
  };
}

async function directLinkPlays({ stageId, params, phases, seed, runs }) {
  const configs = phases.map(
    (phase) =>
      new IdolStageConfig(
        new IdolConfig({
          pItemIds: [],
          ...phase,
          params: [...params, phase.stamina],
          supportBonus: 0,
        }),
        new StageConfig(Stages.getById(stageId)),
        true,
      ),
  );
  const plays = [];
  for (let i = 0; i < runs; i++) {
    resetRand((seed + i) >>> 0);
    const engine = new StageEngine(configs[0], configs);
    const strategy = new STRATEGIES.HeuristicStrategy(engine);
    engine.strategy = strategy;
    plays.push(await new StagePlayer(engine, strategy).play());
  }
  return plays;
}

test("stages page through every non-preview stage once", async (t) => {
  const client = await connect(t);
  const ids = [];
  let offset = 0;
  while (offset != null) {
    const page = await call(client, "gakumas_list_stages", {
      limit: 50,
      offset,
    });
    ids.push(...page.stages.map((stage) => stage.id));
    offset = page.nextOffset;
  }

  const expected = Stages.getAll()
    .filter((stage) => !stage.preview)
    .map((stage) => stage.id)
    .sort((a, b) => a - b);
  assert.deepEqual(ids, expected);
});

test("a stage reads as its data, link turn counts only for link contests", async (t) => {
  const client = await connect(t);
  const { linkTurnCounts, ...contest } = Stages.getById(187);
  const link = Stages.getById(121);

  assert.deepEqual(
    (await call(client, "gakumas_get_stage", { stageId: 187 })).stage,
    contest,
  );
  assert.deepEqual(
    (await call(client, "gakumas_get_stage", { stageId: 121 })).stage,
    link,
  );
});

test("seeded scores match direct engine plays for each plan", async (t) => {
  const client = await connect(t);
  for (const suiteId of ["seed1-001", "seed1-002", "seed1-007"]) {
    for (const enterPercents of [false, true]) {
      const args = loadout(suiteId, { enterPercents, seed: 0xffffffff });
      const result = await call(client, "gakumas_simulate_loadout", args);
      const expected = await directScores(args);
      assert.deepEqual(result.scores, expected);
      assert.equal(result.min, Math.min(...expected));
    }
  }
});

test("simulations on two servers at once keep their seeds", async (t) => {
  const clients = [await connect(t), await connect(t)];
  const loadouts = [
    loadout("seed1-001", { seed: 0, runs: 8 }),
    loadout("seed1-007", { seed: 123, runs: 8 }),
  ];
  const expected = [];
  for (const args of loadouts) expected.push(await directScores(args));

  const results = await Promise.all(
    loadouts.map((args, i) =>
      call(clients[i], "gakumas_simulate_loadout", args),
    ),
  );
  assert.deepEqual(results.map((result) => result.scores), expected);
});

test("a loadout with an unknown ID or customization is refused", async (t) => {
  const client = await connect(t);
  const refused = [
    { stageId: 999999 },
    { stageId: 121 },
    { pItemIds: [999999] },
    { pItemIds: [506] },
    { skillCardIdGroups: [[999999]], customizationGroups: undefined },
    { skillCardIdGroups: [[915]], customizationGroups: undefined },
    { skillCardIdGroups: [[25]], customizationGroups: [[{ 65: 10 }]] },
  ];
  for (const extra of refused) {
    const result = await client.callTool({
      name: "gakumas_simulate_loadout",
      arguments: loadout(undefined, extra),
    });
    assert.equal(result.isError, true, JSON.stringify(extra));
  }
});

test("each link contest plays its phases as the engine does", async (t) => {
  const client = await connect(t);
  for (const stageId of [121, 122, 123]) {
    const args = linkLoadout(stageId);
    const result = await call(client, "gakumas_simulate_link_loadout", args);
    const plays = await directLinkPlays(args);
    assert.deepEqual(result.scores, plays.map((play) => play.score));
    for (const play of plays) {
      const phaseChanges = play.logs
        .filter((log) => log.logType == "linkPhaseChange")
        .map((log) => log.data.phase);
      assert.deepEqual(phaseChanges, [1, 2]);
    }
  }
});

test("a link loadout that doesn't fit its stage is refused", async (t) => {
  const client = await connect(t);
  const args = linkLoadout();
  const [first, second, third] = args.phases;
  const refused = [
    { ...args, stageId: 187 },
    { ...args, phases: [first, second] },
    {
      ...args,
      phases: [first, second, { ...third, skillCardIdGroups: [[999999]] }],
    },
  ];
  for (const input of refused) {
    const result = await client.callTool({
      name: "gakumas_simulate_link_loadout",
      arguments: input,
    });
    assert.equal(result.isError, true, JSON.stringify(input));
  }
});

test("a card found by name simulates with its customization", async (t) => {
  const client = await connect(t);
  const { entities } = await call(client, "gakumas_search_entities", {
    kind: "skillCard",
    query: "軽い足取り+",
  });
  const card = entities.find(({ id }) => id == 25);
  const customizationId = card.availableCustomizations[0];
  const { entity: customization } = await call(client, "gakumas_get_entity", {
    kind: "customization",
    id: Number(customizationId),
  });

  const args = loadout(undefined, {
    skillCardIdGroups: [[card.id]],
    customizationGroups: [[{ [customizationId]: customization.max }]],
  });
  const result = await call(client, "gakumas_simulate_loadout", args);
  assert.deepEqual(result.scores, await directScores(args));
});

test("a cancelled simulation leaves the queue to the next one", async (t) => {
  const client = await connect(t);
  const controller = new AbortController();
  const cancelled = client.callTool(
    {
      name: "gakumas_simulate_loadout",
      arguments: loadout(undefined, { runs: 100 }),
    },
    undefined,
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(cancelled);

  const args = loadout();
  const result = await call(client, "gakumas_simulate_loadout", args);
  assert.deepEqual(result.scores, await directScores(args));
});

test("the server runs from outside the checkout over stdio", async (t) => {
  const client = new Client({ name: "test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(
          new URL("../../../packages/gakumas-tools-mcp/bin.js", import.meta.url),
        ),
      ],
      cwd: tmpdir(),
    }),
  );

  const result = await call(client, "gakumas_simulate_loadout", loadout());
  assert.equal(result.scores.length, 3);
});
