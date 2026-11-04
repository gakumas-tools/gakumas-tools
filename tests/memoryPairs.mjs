/**
 * Ranks every main/sub pair of a set of memories on a stage.
 *
 * Each pair is played on the same selection seeds; the best pair and the
 * baseline pair are then played on separate validation seeds, and the best
 * pair is recommended only if its held-out gain's lower 95% bound is above 0.
 *
 * Usage:
 *   pnpm optimize:memories memories.json --stage 189 --baseline 1,2
 *     [--support-bonus 0.1] [--runs 100] [--validation 200]
 *
 * memories.json is an array of memories, or { memories: [...] }, each with
 * pIdolId, params [Vo, Da, Vi, stamina], pItemIds, skillCardIds and
 * optionally customizations and name. --baseline is the 1-based main,sub
 * positions. Only memories of the stage's plan are paired, as the simulator's
 * memory picker lists them.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
  StagePlayer,
  STRATEGIES,
  resetRand,
} from "gakumas-engine";
import { Stages } from "gakumas-data";
import { rankMemoryPairs } from "../gakumas-tools/utils/memoryPairs.js";
import { silenceConsole } from "./lib.mjs";

const VALIDATION_SEED_OFFSET = 1_000_000;

async function scoreLoadout(loadout, seed) {
  resetRand(seed);
  const idol = new IdolConfig(loadout);
  const stage = new StageConfig(Stages.getById(loadout.stageId));
  const config = new IdolStageConfig(idol, stage, false);
  const engine = new StageEngine(config);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const result = await new StagePlayer(engine, strategy).play();
  return result.score;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      stage: { type: "string" },
      baseline: { type: "string" },
      "support-bonus": { type: "string", default: "0" },
      runs: { type: "string", default: "100" },
      validation: { type: "string", default: "200" },
      top: { type: "string", default: "10" },
    },
  });
  if (positionals.length != 1) fail("Give one memories JSON file");
  const input = JSON.parse(readFileSync(positionals[0], "utf8"));
  const memories = Array.isArray(input) ? input : input.memories;
  if (!Array.isArray(memories) || memories.length < 2) {
    fail("Need at least two memories");
  }

  const stage = Stages.getById(parseInt(values.stage, 10));
  if (!stage) fail(`Unknown stage ${values.stage}`);
  // A link contest plays a deck per phase from linked loadouts, not one pair.
  if (stage.type == "linkContest") fail("Link contests aren't supported");
  const baseline = (values.baseline || "").split(",").map((n) => n - 1);
  if (
    baseline.length != 2 ||
    baseline[0] === baseline[1] ||
    baseline.some((i) => !Number.isInteger(i) || !memories[i])
  ) {
    fail("--baseline needs two different 1-based memory positions, main,sub");
  }
  const runs = parseInt(values.runs, 10);
  const validationRuns = parseInt(values.validation, 10);
  const supportBonus = parseFloat(values["support-bonus"]);
  if (!(runs > 0) || !(validationRuns > 1) || !(supportBonus >= 0)) {
    fail("--runs, --validation and --support-bonus must be positive");
  }

  const seeds = (n, offset) => Array.from({ length: n }, (_, i) => offset + i);
  const restore = silenceConsole();
  let result;
  try {
    result = await rankMemoryPairs({
      stage,
      memories,
      baseline,
      supportBonus,
      selectionSeeds: seeds(runs, 0),
      validationSeeds: seeds(validationRuns, VALIDATION_SEED_OFFSET),
      score: scoreLoadout,
    });
  } finally {
    restore();
  }

  const label = ([main, sub]) =>
    `${main + 1}+${sub + 1} ${memories[main].name || ""} / ${
      memories[sub].name || ""
    }`;
  const round = (n) => Math.round(n * 10) / 10;
  console.log(`Stage ${stage.id} ${stage.name}, ${runs} selection runs`);
  for (const { pair, mean } of result.ranked.slice(0, parseInt(values.top))) {
    console.log(`  ${round(mean)}\t${label(pair)}`);
  }
  const { validation } = result;
  console.log(
    `Held out (${validationRuns} runs): baseline ${label(baseline)} ${round(
      validation.baseline,
    )}, best ${label(result.ranked[0].pair)} ${round(validation.best)}, ` +
      `gain ${round(validation.gain)} ± ${round(validation.margin)}`,
  );
  console.log(`Recommended: ${label(result.recommended)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(e.message));
}
