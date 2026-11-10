import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  SkillCards,
  Stages,
} from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
  getDefaultParams,
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

test("stages filter by season and stage number", async (t) => {
  const client = await connect(t);
  const ids = async (args) =>
    (await call(client, "gakumas_list_stages", args)).stages.map(
      (stage) => stage.id,
    );
  const season = Stages.getById(190).season;
  const expected = Stages.getAll()
    .filter((stage) => !stage.preview && stage.season == season)
    .map((stage) => stage.id)
    .sort((a, b) => a - b);

  assert.deepEqual(await ids({ season }), expected);
  assert.deepEqual(
    await ids({ season, stage: Stages.getById(190).stage }),
    [190],
  );
});

test("a contest without params plays the website's defaults", async (t) => {
  const client = await connect(t);
  const { params, ...args } = loadout(undefined, {
    stageId: 190,
    supportBonus: undefined,
  });
  const result = await call(client, "gakumas_simulate_loadout", args);
  const defaults = getDefaultParams(Stages.getById(190));

  assert.deepEqual(result.params, defaults);
  assert.deepEqual(
    result.scores,
    await directScores({ ...args, params: defaults, supportBonus: 0.1 }),
  );
  const url = new URL(result.simulatorUrl);
  assert.equal(url.searchParams.get("stage"), "190");
  assert.equal(url.searchParams.get("params"), defaults.join("-"));
});

test("compared loadouts play the same seeds and pair their differences", async (t) => {
  const client = await connect(t);
  const base = loadout("seed1-002", { runs: 5 });
  const other = loadout("seed1-001");
  const deck = ({ pItemIds, skillCardIdGroups, customizationGroups }) => ({
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  });
  const result = await call(client, "gakumas_compare_loadouts", {
    stageId: base.stageId,
    params: base.params,
    supportBonus: base.supportBonus,
    loadouts: [deck(base), deck(other)],
    seed: base.seed,
    runs: base.runs,
  });

  const expected = [
    await directScores(base),
    await directScores({ ...base, ...deck(other) }),
  ];
  const means = expected.map(
    (scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
  assert.deepEqual(result.loadouts.map(({ mean }) => mean), means);
  assert.equal(result.loadouts[0].vsFirst, undefined);
  assert.equal(result.loadouts[1].vsFirst.mean, means[1] - means[0]);
  assert.ok(result.loadouts[1].vsFirst.standardError >= 0);
  assert.match(result.loadouts[1].simulatorUrl, /stage=/);
});

test("an optimized loadout starts from its p-idol and replays as reported", async (t) => {
  const client = await connect(t);
  const progress = [];
  const result = (
    await client.callTool(
      {
        name: "gakumas_optimize_loadout",
        arguments: {
          stageId: 190,
          pIdolId: 32,
          skillCardIdGroups: [[0, 0, 0, 0, 0, 0]],
          cardPool: [816, 762, 752],
          pItemPool: [141, 71],
          seed: 7,
          runs: 2,
          holdoutRuns: 3,
        },
      },
      undefined,
      { onprogress: (update) => progress.push(update) },
    )
  ).structuredContent;

  assert.equal(result.loadout.skillCardIdGroups[0][0], 279);
  assert.equal(result.loadout.pItemIds[0], 90);
  assert.equal(result.skillCardNames[0][0], SkillCards.getById(279).name);
  assert.ok(result.converged);
  assert.ok(progress.length > 0);

  const holdout = await directScores({
    stageId: 190,
    params: result.params,
    supportBonus: 0.1,
    ...result.loadout,
    seed: result.holdout.seed,
    runs: 3,
  });
  assert.equal(
    result.holdout.mean,
    holdout.reduce((sum, score) => sum + score, 0) / holdout.length,
  );
  assert.equal(new URL(result.simulatorUrl).searchParams.get("stage"), "190");
});

test("an optimization that starts against the rules is refused", async (t) => {
  const client = await connect(t);
  const result = await client.callTool({
    name: "gakumas_optimize_loadout",
    arguments: {
      stageId: 190,
      skillCardIdGroups: [[279, 278, 0, 0, 0, 0]],
      seed: 0,
    },
  });
  assert.equal(result.isError, true);
});

test("an event stage without params is refused", async (t) => {
  const client = await connect(t);
  const event = Stages.getAll().find(
    (stage) => stage.type == "event" && !stage.preview,
  );
  const { params, ...args } = loadout(undefined, { stageId: event.id });
  const result = await client.callTool({
    name: "gakumas_simulate_loadout",
    arguments: args,
  });
  assert.equal(result.isError, true);
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
  // Hide a released card and item for this test, whatever previews are hidden.
  for (const [ids, id] of [
    [HIDDEN_CARD_IDS, 915],
    [HIDDEN_ITEM_IDS, 506],
  ]) {
    if (ids.has(id)) continue;
    ids.add(id);
    t.after(() => ids.delete(id));
  }
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
