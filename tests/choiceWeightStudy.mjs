/**
 * Searches WeightedHeuristicStrategy weights on half of the suite's contest
 * decks and checks the best profile for each plan on the other half.
 * See choice-weight-study.md.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
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
import WeightedHeuristicStrategy, {
  DEFAULT_WEIGHTS,
} from "../packages/gakumas-engine/strategies/WeightedHeuristicStrategy.js";
import { loadSuite, loadoutFromQuery } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLANS = ["sense", "logic", "anomaly"];
const WEIGHT_VALUES = [0.25, 0.5, 1, 2, 4];
const SEEDS_PER_DECK = 10_000;
const TRAIN_SEED = 100_000;
const VALIDATION_SEED = 10_000_000;
const SOURCES = [
  "packages/gakumas-data",
  "packages/gakumas-engine",
  "tests/suite.jsonl",
  "tests/lib.mjs",
  "tests/choiceWeightStudy.mjs",
];

export function deckKey({ pItemIds, skillCardIdGroups, customizationGroups }) {
  const cards = [];
  for (let i = 0; i < skillCardIdGroups.length; i++) {
    for (let j = 0; j < skillCardIdGroups[i].length; j++) {
      const id = skillCardIdGroups[i][j];
      if (!id) continue;
      const customizations = customizationGroups?.[i]?.[j] ?? {};
      cards.push(JSON.stringify([id, Object.entries(customizations).sort()]));
    }
  }
  const items = pItemIds.filter(Boolean).sort((a, b) => a - b);
  return JSON.stringify([items, cards.sort()]);
}

export function deckPartition(loadout) {
  const hash = createHash("sha256").update(deckKey(loadout)).digest();
  return hash[0] % 2 ? "train" : "validation";
}

// The baseline, then every other profile in a fixed shuffled order, so a run
// cut short has still tried an unbiased sample.
export function candidates() {
  let grid = [{}];
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    grid = grid.flatMap((weights) =>
      WEIGHT_VALUES.map((value) => ({ ...weights, [key]: value })),
    );
  }
  grid = grid.filter((weights) =>
    Object.values(weights).some((value) => value != 1),
  );

  let seed = 0xc0decafe;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [grid[i], grid[j]] = [grid[j], grid[i]];
  }

  return [{ ...DEFAULT_WEIGHTS }, ...grid];
}

const sum = (values) => values.reduce((a, b) => a + b, 0);

function mean(values) {
  return sum(values) / values.length;
}

function margin95(values) {
  const average = mean(values);
  const variance =
    sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
  return 1.96 * Math.sqrt(variance / values.length);
}

// Each deck counts once, so high-scoring decks don't outweigh the rest.
export function summarize(decks) {
  const relativeGains = decks.map((deck) => deck.relativeGain);
  const meanRelativeGain = mean(relativeGains);
  const margin = margin95(relativeGains);
  return {
    decks: decks.length,
    meanRelativeGain,
    meanGain: mean(decks.map((deck) => deck.gain)),
    lower95: meanRelativeGain - margin,
    upper95: meanRelativeGain + margin,
    worstDeckRelativeGain: Math.min(...relativeGains),
    improvedDecks: decks.filter((deck) => deck.gain > 0).length,
    worseDecks: decks.filter((deck) => deck.gain < 0).length,
  };
}

function summarizeByPlan(decks) {
  return Object.fromEntries(
    PLANS.map((plan) => [
      plan,
      summarize(decks.filter((deck) => deck.plan == plan)),
    ]),
  );
}

function loadDecks() {
  const decks = loadSuite().map((row, index) => {
    const loadout = loadoutFromQuery(row.query);
    const partition = deckPartition(loadout);
    const stage = Stages.getById(loadout.stageId);
    const idol = new IdolConfig(loadout);
    const config = new IdolStageConfig(idol, new StageConfig(stage));
    const plan = idol.plan ?? stage.plan;
    return { id: row.id, index, plan, partition, config };
  });
  return decks.filter(
    (deck) =>
      deck.config.stage.type == "contest" && PLANS.includes(deck.plan),
  );
}

async function playDeck(deck, runs, seed, weights) {
  const engine = new StageEngine(deck.config);
  const strategy = weights
    ? new WeightedHeuristicStrategy(engine, weights)
    : new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;

  const scores = [];
  for (let i = 0; i < runs; i++) {
    resetRand(seed + deck.index * SEEDS_PER_DECK + i);
    const result = await new StagePlayer(engine, strategy).play();
    scores.push(result.score);
  }
  return scores;
}

function compare(deck, baseline, current) {
  const differences = current.map((score, i) => score - baseline[i]);
  const baselineMean = mean(baseline);
  const gain = mean(differences);
  return {
    id: deck.id,
    plan: deck.plan,
    baselineMean,
    currentMean: baselineMean + gain,
    gain,
    relativeGain: gain / Math.max(1, baselineMean),
    pairedMargin95: margin95(differences),
    better: differences.filter((difference) => difference > 0).length,
    worse: differences.filter((difference) => difference < 0).length,
  };
}

function sourceHash() {
  const files = execFileSync("git", ["ls-files", ...SOURCES], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path).update(readFileSync(resolve(ROOT, path)));
  }
  return hash.digest("hex");
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

async function main() {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      candidates: { type: "string", default: "1024" },
      "train-runs": { type: "string", default: "200" },
      "validation-runs": { type: "string", default: "1000" },
      "max-minutes": { type: "string", default: "300" },
      resume: { type: "boolean", default: false },
    },
  });
  if (!values.output) throw new Error("Pass --output <dir>");
  const output = resolve(values.output);
  const count = Number(values.candidates);
  const trainRuns = Number(values["train-runs"]);
  const validationRuns = Number(values["validation-runs"]);
  const deadline = Date.now() + Number(values["max-minutes"]) * 60_000;

  const decks = loadDecks();
  const trainDecks = decks.filter((deck) => deck.partition == "train");
  const validationDecks = decks.filter(
    (deck) => deck.partition == "validation",
  );

  const metadata = {
    version: 1,
    sourceHash: sourceHash(),
    count,
    trainRuns,
    validationRuns,
    trainSeed: TRAIN_SEED,
    validationSeed: VALIDATION_SEED,
    deckIds: {
      train: trainDecks.map((deck) => deck.id),
      validation: validationDecks.map((deck) => deck.id),
    },
  };
  const paths = {
    metadata: resolve(output, "metadata.json"),
    training: resolve(output, "training.jsonl"),
    selection: resolve(output, "selection.json"),
    validation: resolve(output, "validation.json"),
  };

  mkdirSync(output, { recursive: true });
  if (existsSync(paths.metadata)) {
    const saved = JSON.stringify(readJson(paths.metadata));
    if (!values.resume || saved != JSON.stringify(metadata)) {
      throw new Error(
        "This study exists: --resume it with the same sources and options",
      );
    }
  } else {
    writeJson(paths.metadata, metadata);
  }
  if (existsSync(paths.validation)) {
    throw new Error("This study is already validated");
  }

  const grid = candidates().slice(0, count);
  const trained = existsSync(paths.training)
    ? readFileSync(paths.training, "utf8").trim().split("\n").map(JSON.parse)
    : [];
  let selection = existsSync(paths.selection)
    ? readJson(paths.selection)
    : null;

  console.log(
    JSON.stringify({
      event: "start",
      train: trainDecks.length,
      validation: validationDecks.length,
      resumeAt: trained.length,
    }),
  );

  if (!selection) {
    const baselines = new Map();
    for (const deck of trainDecks) {
      baselines.set(deck.id, await playDeck(deck, trainRuns, TRAIN_SEED));
    }

    for (let index = trained.length; index < grid.length; index++) {
      if (Date.now() >= deadline) break;
      const weights = grid[index];
      const results = [];
      for (const deck of trainDecks) {
        const baseline = baselines.get(deck.id);
        const current =
          index == 0
            ? baseline
            : await playDeck(deck, trainRuns, TRAIN_SEED, weights);
        results.push(compare(deck, baseline, current));
      }
      const candidate = { index, weights, plans: summarizeByPlan(results) };
      appendFileSync(paths.training, JSON.stringify(candidate) + "\n");
      trained.push(candidate);
      console.log(JSON.stringify({ event: "candidate", index }));
    }

    // The baseline comes first, so it wins ties.
    selection = {};
    for (const plan of PLANS) {
      let best = trained[0];
      for (const candidate of trained) {
        const gain = candidate.plans[plan].meanRelativeGain;
        if (gain > best.plans[plan].meanRelativeGain) best = candidate;
      }
      selection[plan] = best;
    }
    // Saved before any validation deck is played.
    writeJson(paths.selection, selection);
  }

  const perDeck = [];
  for (const deck of validationDecks) {
    const weights = selection[deck.plan].weights;
    const baseline = await playDeck(deck, validationRuns, VALIDATION_SEED);
    const current = await playDeck(
      deck,
      validationRuns,
      VALIDATION_SEED,
      weights,
    );
    perDeck.push(compare(deck, baseline, current));
  }

  const plans = summarizeByPlan(perDeck);
  for (const plan of PLANS) {
    const summary = plans[plan];
    summary.passesEngineGate =
      summary.decks >= 30 &&
      summary.lower95 > 0 &&
      summary.worstDeckRelativeGain >= -0.1;
  }
  writeJson(paths.validation, {
    descriptor: metadata,
    completedCandidates: trained.length,
    selection,
    plans,
    perDeck,
  });
  console.log(JSON.stringify({ event: "validated", plans }));
}

if (process.argv[1] == fileURLToPath(import.meta.url)) {
  await main();
}
