import { setImmediate } from "node:timers/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Customizations, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  getDefaultParams,
  getSimulatorUrl,
  playScores,
  stageConfigFor,
} from "gakumas-engine";
import {
  ENTITY_KINDS,
  getEntity,
  readEntity,
  searchEntities,
} from "./entities.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const id = z.number().int().min(0);
const plan = z.enum(["sense", "logic", "anomaly", "free"]);

const listStagesSchema = z
  .object({
    query: z.string().default(""),
    type: z.enum(["contest", "event", "linkContest"]).optional(),
    plan: plan.optional(),
    season: z.number().int().min(1).optional(),
    stage: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Stage number in its season"),
    includePreview: z.boolean().default(false),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

const searchEntitiesSchema = z
  .object({
    kind: z
      .enum(ENTITY_KINDS)
      .optional()
      .describe("Leave out to search every kind"),
    query: z.string().default(""),
    plan: plan.optional(),
    upgraded: z.boolean().optional(),
    sourceType: z
      .enum(["default", "pIdol", "produce", "support"])
      .optional()
      .describe("pIdol finds signature cards and items"),
    mode: z
      .enum(["stage", "produce"])
      .optional()
      .describe("P-items: stage items work in contests"),
    pIdolId: id.optional(),
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

const seed = z.number().int().min(0).max(0xffffffff);

const stageSetup = {
  stageId: id,
  params: z
    .tuple([
      z.number().min(0),
      z.number().min(0),
      z.number().min(0),
      z.number().int().min(0),
    ])
    .optional()
    .describe(
      "Vo, Da, Vi, stamina. Contest stages default to the website's: 2700, 2000, 800 by the stage's criteria, and 50 stamina",
    ),
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
    .default(0.1)
    .describe("A fraction: 0.1 is 10%, the website's default"),
};

const simulateSchema = z
  .object({
    ...stageSetup,
    ...deck,
    seed,
    runs: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const compareSchema = z
  .object({
    ...stageSetup,
    loadouts: z.array(z.object(deck).strict()).min(2).max(10),
    seed,
    runs: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Runs per loadout, on the same seeds for each"),
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
    seed,
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

function listStages({
  query,
  type,
  plan,
  season,
  stage: stageNumber,
  includePreview,
  offset,
  limit,
}) {
  const needle = query.trim().toLowerCase();
  const stages = Stages.getAll()
    .filter((stage) => includePreview || !stage.preview)
    .filter((stage) => !type || stage.type == type)
    .filter((stage) => !plan || stage.plan == plan)
    .filter((stage) => season == null || stage.season == season)
    .filter((stage) => stageNumber == null || stage.stage == stageNumber)
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

function resolveParams(stage, { params, enterPercents }) {
  if (params) return params;
  if (stage.type != "contest" || enterPercents) {
    throw new Error(`Stage ${stage.id} needs params as percentages.`);
  }
  return getDefaultParams(stage);
}

function simulatorUrl(loadout) {
  const { skillCardIdGroups, customizationGroups = [] } = loadout;
  return getSimulatorUrl({
    ...loadout,
    customizationGroups: skillCardIdGroups.map((group, i) =>
      group.map((_, j) => customizationGroups[i]?.[j] ?? {}),
    ),
  });
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

// Lets a cancellation arrive between runs.
const tick = () => setImmediate();

function summarize(scores) {
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

// Differences of runs on the same seed cancel most of the luck both share.
function pairedDifference(scores, baseline) {
  const diffs = scores.map((score, i) => score - baseline[i]);
  const { mean } = summarize(diffs);
  const variance =
    diffs.reduce((sum, diff) => sum + (diff - mean) ** 2, 0) /
    (diffs.length - 1);
  return {
    mean,
    standardError: diffs.length > 1 ? Math.sqrt(variance / diffs.length) : null,
  };
}

async function play(config, linkConfigs, { seed, runs }, signal) {
  const scores = await playScores(config, linkConfigs, {
    seed,
    runs,
    signal,
    tick,
  });
  return {
    typeMultipliers: config.typeMultipliers,
    scores,
    ...summarize(scores),
  };
}

function getSingleStage(stageId) {
  const stage = getStage(stageId);
  if (stage.preview) {
    throw new Error(`Stage ${stage.id} is a preview and can't be simulated.`);
  }
  if (stage.type == "linkContest") {
    throw new Error(
      `Stage ${stage.id} is a link contest: use gakumas_simulate_link_loadout.`,
    );
  }
  return stage;
}

async function simulate(loadout, signal) {
  const stage = getSingleStage(loadout.stageId);
  checkLoadout(loadout);
  loadout = { ...loadout, params: resolveParams(stage, loadout) };

  return {
    ...(await play(stageConfigFor(stage, loadout), null, loadout, signal)),
    params: loadout.params,
    simulatorUrl: simulatorUrl(loadout),
  };
}

async function compare({ loadouts: decks, seed, runs, ...setup }, signal) {
  const stage = getSingleStage(setup.stageId);
  decks.forEach(checkLoadout);
  const params = resolveParams(stage, setup);

  const plays = [];
  for (const deck of decks) {
    const loadout = { ...setup, ...deck, params };
    const scores = await playScores(stageConfigFor(stage, loadout), null, {
      seed,
      runs,
      signal,
      tick,
    });
    plays.push({ loadout, scores });
  }

  const baseline = plays[0].scores;
  return {
    params,
    loadouts: plays.map(({ loadout, scores }, i) => ({
      ...summarize(scores),
      ...(i > 0 && { vsFirst: pairedDifference(scores, baseline) }),
      simulatorUrl: simulatorUrl(loadout),
    })),
  };
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
        "Search stages by name or ID, optionally by type, plan, season and stage number. Preview stages are left out unless asked for.",
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
        "Play a contest or event stage with HeuristicStrategy. Run i is seeded with (seed + i) mod 2^32, so the same input gives the same scores. Zero IDs are empty slots. Gives a link that opens the loadout in the website's simulator.",
      inputSchema: simulateSchema,
      annotations: READ_ONLY,
    },
    async (input, { signal }) =>
      json(await queueSimulation(() => simulate(input, signal))),
  );

  server.registerTool(
    "gakumas_compare_loadouts",
    {
      title: "Compare loadouts",
      description:
        "Play several decks on one stage with the same params and seeds, as gakumas_simulate_loadout does. Each deck after the first gives its mean difference from the first, with a standard error: shared seeds cancel most of the luck, so this tells small differences apart in far fewer runs.",
      inputSchema: compareSchema,
      annotations: READ_ONLY,
    },
    async (input, { signal }) =>
      json(await queueSimulation(() => compare(input, signal))),
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
        "Search entities by their name in the data, usually Japanese, or by ID; a p-idol's title is often English. Gives the IDs and customizations a loadout needs.",
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
        "Read one entity's data and parsed effects. A customization's max is its highest level. A p-idol also lists its signature cards and P-items.",
      inputSchema: z.object({ kind: z.enum(ENTITY_KINDS), id }).strict(),
      annotations: READ_ONLY,
    },
    async ({ kind, id }) => json(readEntity(kind, id)),
  );

  return server;
}
