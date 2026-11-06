/**
 * Shared utilities for the regression harness.
 *
 * The harness runs the structured engine against a frozen suite of loadouts
 * (tests/suite.jsonl) and flags any score drift. The suite
 * itself is a plain JSONL file — one loadout per line — so it diffs cleanly
 * in git and loadouts can be appended by hand or with `regression:add`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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

const REGRESSION_DIR = dirname(fileURLToPath(import.meta.url));

// --- Query parser ---

// Query strings are the same shape the app's loadout URL uses: cards in
// groups separated by "_", customizations aligned to each card slot.

function deserializeIds(str) {
  return str.split("-").map((n) => parseInt(n, 10) || 0);
}

function deserializeCustomizations(str) {
  return str.split("-").map((c) =>
    c
      .split("e")
      .filter((e) => e)
      .reduce((acc, cur) => {
        const [k, v] = cur.split("x");
        acc[k] = parseInt(v, 10);
        return acc;
      }, {}),
  );
}

export function loadoutFromQuery(queryString) {
  const searchParams = new URLSearchParams(queryString);
  const skillCardIdGroups = (searchParams.get("cards") || "")
    .split("_")
    .map(deserializeIds);
  let customizationGroups = (searchParams.get("customizations") || "")
    .split("_")
    .map(deserializeCustomizations);

  if (skillCardIdGroups.length != customizationGroups.length) {
    customizationGroups = skillCardIdGroups.map((g) => g.map(() => ({})));
  }

  return {
    stageId: parseInt(searchParams.get("stage"), 10),
    enterPercents: searchParams.get("enter_percents") == "1",
    supportBonus: parseFloat(searchParams.get("support_bonus")) || null,
    params: deserializeIds(searchParams.get("params") || ""),
    pItemIds: deserializeIds(searchParams.get("items") || ""),
    skillCardIdGroups,
    customizationGroups,
  };
}
export const SUITE_PATH = resolve(REGRESSION_DIR, "suite.jsonl");
export const PERF_BASELINE_PATH = resolve(REGRESSION_DIR, "perf-baseline.json");

// --- Suite I/O ---

export function loadSuite() {
  if (!existsSync(SUITE_PATH)) return [];
  const text = readFileSync(SUITE_PATH, "utf8");
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    entries.push(JSON.parse(line));
  }
  return entries;
}

export function writeSuite(entries) {
  const lines = entries.map((e) => JSON.stringify(e));
  writeFileSync(SUITE_PATH, lines.join("\n") + "\n");
}

// --- Engine runner ---

// Silence the engine's own console chatter without swallowing errors from
// the harness itself. Caller is responsible for restoring.
export function silenceConsole() {
  const orig = {
    log: console.log,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };
  const noop = () => {};
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
  return () => Object.assign(console, orig);
}

export async function runQuery(query) {
  resetRand();
  const loadout = loadoutFromQuery(query);
  const idol = new IdolConfig(loadout);
  const stage = new StageConfig(Stages.getById(loadout.stageId));
  const config = new IdolStageConfig(idol, stage, loadout.enterPercents);
  const engine = new StageEngine(config);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const result = await new StagePlayer(engine, strategy).play();
  return result.score;
}

export async function runSuite(entries, { onProgress } = {}) {
  const restore = silenceConsole();
  try {
    const results = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const actual = await runQuery(entry.query);
      results[i] = { ...entry, actual };
      if (onProgress) onProgress(i + 1, entries.length);
    }
    return results;
  } finally {
    restore();
  }
}
