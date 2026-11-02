import { setImmediate } from "node:timers/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Customizations, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
  resetRand,
} from "gakumas-engine";
import { ENTITY_KINDS, getEntity, searchEntities } from "./entities.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const id = z.number().int().min(0);
const plan = z.enum(["sense", "logic", "anomaly", "free"]);

const listStagesSchema = z
  .object({
    query: z.string().default(""),
    type: z.enum(["contest", "event", "linkContest"]).optional(),
    plan: plan.optional(),
    includePreview: z.boolean().default(false),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

const searchEntitiesSchema = z
  .object({
    kind: z.enum(ENTITY_KINDS),
    query: z.string().default(""),
    plan: plan.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

const deck = {
  pItemIds: z.array(id).max(4).default([]),
  skillCardIdGroups: z.array(z.array(id).max(6)).min(1).max(4),
  customizationGroups: z
    .array(z.array(z.record(z.string(), z.number().int().min(0))))
    .optional()
    .describe("Customization ID to level, for each card slot"),
};

const simulateSchema = z
  .object({
    stageId: id,
    params: z
      .tuple([
        z.number().min(0),
        z.number().min(0),
        z.number().min(0),
        z.number().int().min(0),
      ])
      .describe("Vo, Da, Vi, stamina"),
    enterPercents: z
      .boolean()
      .default(false)
      .describe(
        "Contest stages only: Vo/Da/Vi are displayed percentages, not raw parameters. Event stages always take percentages.",
      ),
    supportBonus: z
      .number()
      .min(0)
      .max(1)
      .default(0)
      .describe("A fraction: 0.1 is 10%"),
    ...deck,
    seed: z.number().int().min(0).max(0xffffffff),
    runs: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const simulateLinkSchema = z
  .object({
    stageId: id,
    params: z
      .tuple([z.number().min(0), z.number().min(0), z.number().min(0)])
      .describe("Vo, Da, Vi as displayed percentages, shared by every phase"),
    phases: z
      .array(
        z.object({ stamina: z.number().int().min(0), ...deck }).strict(),
      )
      .min(1),
    seed: z.number().int().min(0).max(0xffffffff),
    runs: z.number().int().min(1).max(100).default(1),
  })
  .strict();

// The engine's random stream is global, so simulations take turns.
let simulations = Promise.resolve();

function queueSimulation(simulation) {
  const run = simulations.then(simulation);
  simulations = run.catch(() => {});
  return run;
}

function getStage(stageId) {
  const stage = Stages.getById(stageId);
  if (!stage) throw new Error(`Unknown stage ${stageId}.`);
  return stage;
}

function stageSummary(stage) {
  const { id, name, type, plan, preview, season, criteria, turnCounts } =
    stage;
  return { id, name, type, plan, preview, season, criteria, turnCounts };
}

function listStages({ query, type, plan, includePreview, offset, limit }) {
  const needle = query.trim().toLowerCase();
  const stages = Stages.getAll()
    .filter((stage) => includePreview || !stage.preview)
    .filter((stage) => !type || stage.type == type)
    .filter((stage) => !plan || stage.plan == plan)
    .filter((stage) =>
      `${stage.id} ${stage.name}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.id - b.id);
  const nextOffset = offset + limit;
  return {
    total: stages.length,
    nextOffset: nextOffset < stages.length ? nextOffset : null,
    stages: stages.slice(offset, nextOffset).map(stageSummary),
  };
}

function readStage({ stageId }) {
  const { linkTurnCounts, ...stage } = getStage(stageId);
  // Stages other than link contests have NaN link turn counts.
  if (stage.type == "linkContest") stage.linkTurnCounts = linkTurnCounts;
  return { stage };
}

function checkLoadout({ pItemIds, skillCardIdGroups, customizationGroups }) {
  for (const pItemId of pItemIds) {
    if (pItemId) getEntity("pItem", pItemId);
  }
  for (const [i, group] of skillCardIdGroups.entries()) {
    for (const [j, cardId] of group.entries()) {
      if (!cardId) continue;
      const card = getEntity("skillCard", cardId);

      const customizations = customizationGroups?.[i]?.[j] ?? {};
      for (const [customizationId, level] of Object.entries(customizations)) {
        if (!level) continue;
        const customization = Customizations.getById(Number(customizationId));
        if (
          !card.availableCustomizations.includes(customizationId) ||
          level > customization.max
        ) {
          throw new Error(
            `Skill card ${cardId} can't take customization ${customizationId} at level ${level}.`,
          );
        }
      }
    }
  }
}

async function play(config, linkConfigs, { seed, runs }, signal) {
  const engine = new StageEngine(config, linkConfigs);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;

  const scores = [];
  for (let i = 0; i < runs; i++) {
    signal.throwIfAborted();
    resetRand((seed + i) >>> 0);
    const { score } = await new StagePlayer(engine, strategy).play();
    scores.push(score);
    // Lets a cancellation arrive between runs.
    await setImmediate();
  }
  return {
    typeMultipliers: config.typeMultipliers,
    scores,
    min: Math.min(...scores),
    max: Math.max(...scores),
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

async function simulate(loadout, signal) {
  const stage = getStage(loadout.stageId);
  if (stage.preview) {
    throw new Error(`Stage ${stage.id} is a preview and can't be simulated.`);
  }
  if (stage.type == "linkContest") {
    throw new Error(
      `Stage ${stage.id} is a link contest: use gakumas_simulate_link_loadout.`,
    );
  }
  checkLoadout(loadout);

  const config = new IdolStageConfig(
    new IdolConfig(loadout),
    new StageConfig(stage),
    loadout.enterPercents,
  );
  return play(config, null, loadout, signal);
}

async function simulateLink({ stageId, params, phases, ...seeded }, signal) {
  const stage = getStage(stageId);
  if (stage.preview) {
    throw new Error(`Stage ${stage.id} is a preview and can't be simulated.`);
  }
  if (stage.type != "linkContest") {
    throw new Error(`Stage ${stage.id} isn't a link contest.`);
  }
  if (phases.length != stage.linkTurnCounts.length) {
    throw new Error(
      `Stage ${stage.id} has ${stage.linkTurnCounts.length} phases.`,
    );
  }

  const configs = phases.map((phase) => {
    checkLoadout(phase);
    const idol = new IdolConfig({
      ...phase,
      params: [...params, phase.stamina],
      supportBonus: 0,
    });
    return new IdolStageConfig(idol, new StageConfig(stage), true);
  });
  return play(configs[0], configs, seeded, signal);
}

function json(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function createMcpServer() {
  const server = new McpServer(
    { name: "gakumas-tools", version: "0.1.0" },
    {
      instructions:
        "Stages and scores come from this repository's data and simulator, not from the game.",
    },
  );

  server.registerTool(
    "gakumas_list_stages",
    {
      title: "Find stages",
      description:
        "Search stages by name or ID, optionally by type and plan. Preview stages are left out unless asked for.",
      inputSchema: listStagesSchema,
      annotations: READ_ONLY,
    },
    async (input) => json(listStages(input)),
  );

  server.registerTool(
    "gakumas_get_stage",
    {
      title: "Read a stage",
      description: "A stage's criteria, turn counts and parsed effects.",
      inputSchema: z.object({ stageId: id }).strict(),
      annotations: READ_ONLY,
    },
    async (input) => json(readStage(input)),
  );

  server.registerTool(
    "gakumas_simulate_loadout",
    {
      title: "Simulate a loadout",
      description:
        "Play a contest or event stage with HeuristicStrategy. Run i is seeded with (seed + i) mod 2^32, so the same input gives the same scores. Zero IDs are empty slots.",
      inputSchema: simulateSchema,
      annotations: READ_ONLY,
    },
    async (input, { signal }) =>
      json(await queueSimulation(() => simulate(input, signal))),
  );

  server.registerTool(
    "gakumas_simulate_link_loadout",
    {
      title: "Simulate a link contest",
      description:
        "Play a link contest with HeuristicStrategy, one deck and stamina per phase, seeded as gakumas_simulate_loadout is.",
      inputSchema: simulateLinkSchema,
      annotations: READ_ONLY,
    },
    async (input, { signal }) =>
      json(await queueSimulation(() => simulateLink(input, signal))),
  );

  server.registerTool(
    "gakumas_search_entities",
    {
      title: "Find cards, items, idols or customizations",
      description:
        "Search one kind of entity by its name in the data, usually Japanese, or by ID. Gives the IDs and customizations a loadout needs.",
      inputSchema: searchEntitiesSchema,
      annotations: READ_ONLY,
    },
    async (input) => json(searchEntities(input)),
  );

  server.registerTool(
    "gakumas_get_entity",
    {
      title: "Read a card, item, idol or customization",
      description:
        "Read one entity's data and parsed effects. A customization's max is its highest level.",
      inputSchema: z.object({ kind: z.enum(ENTITY_KINDS), id }).strict(),
      annotations: READ_ONLY,
    },
    async ({ kind, id }) => json({ entity: getEntity(kind, id) }),
  );

  return server;
}
