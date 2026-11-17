/**
 * End-to-end simulator benchmark on a fixed, recorded workload.
 *
 *   pnpm bench:sim            # time the workload, compare to bench-sim-baseline.json
 *   pnpm bench:sim --update   # record a new baseline
 *
 * Workload: every STRIDE-th loadout of suite.jsonl (fixed ids, listed in the
 * baseline), each run through the app's own createSimulation (the code a
 * simulator worker runs) for RUNS runs with the HeuristicStrategy, after
 * resetRand(SEED). It runs on one thread, so the timing doesn't depend on the
 * machine's core count the way the app's worker pool does.
 *
 * Timing: 1 warmup pass, then TRIALS timed passes of the whole workload; the
 * reported number is the median pass time.
 *
 * Results hash: sha256 over every loadout's result (scores, average, min/avg/max
 * runs, graph, card usage, score stats). An optimization must leave it unchanged.
 *
 * Timings only compare on one machine: to show a speedup, run this on master
 * and on the branch on the same machine, back to back. The recorded baseline
 * names the commit, machine and node version it came from.
 */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { execSync } from "node:child_process";
import { IdolConfig, IdolStageConfig, StageConfig, resetRand } from "gakumas-engine";
import { Stages } from "gakumas-data";
import { createSimulation } from "@/simulator";
import { loadSuite, loadoutFromQuery, silenceConsole } from "./lib.mjs";

const BASELINE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "bench-sim-baseline.json");
const UPDATE = process.argv.includes("--update");
const STRIDE = 25;
const RUNS = 200;
const SEED = 1;
const TRIALS = 7;
const STRATEGY = "HeuristicStrategy";

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const workload = loadSuite().filter((_, i) => i % STRIDE === 0);

async function pass() {
  const hash = createHash("sha256");
  const restore = silenceConsole();
  const t0 = performance.now();
  try {
    for (const { id, query } of workload) {
      resetRand(SEED);
      const loadout = loadoutFromQuery(query);
      const config = new IdolStageConfig(
        new IdolConfig(loadout),
        new StageConfig(Stages.getById(loadout.stageId)),
        loadout.enterPercents,
      );
      const simulation = createSimulation(config, null, STRATEGY);
      await simulation.run(RUNS);
      hash.update(id).update(JSON.stringify(simulation.result()));
    }
  } finally {
    restore();
  }
  return { ms: performance.now() - t0, hash: hash.digest("hex") };
}

console.log(`bench:sim: ${workload.length} loadouts x ${RUNS} runs, seed ${SEED}, 1 warmup + ${TRIALS} trials`);
const warm = await pass();
const times = [];
for (let t = 0; t < TRIALS; t++) {
  const { ms, hash } = await pass();
  if (hash !== warm.hash) {
    console.error(`Results differ between passes (${warm.hash.slice(0, 12)} vs ${hash.slice(0, 12)}): the workload isn't deterministic.`);
    process.exit(2);
  }
  times.push(ms);
  console.log(`  trial ${t + 1}/${TRIALS}: ${ms.toFixed(0)} ms`);
}
const medianMs = median(times);
console.log(`median ${medianMs.toFixed(0)} ms, results ${warm.hash}`);

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : null;
if (UPDATE) {
  let commit = null;
  try {
    commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {}
  const out = {
    median_ms: Math.round(medianMs),
    trials_ms: times.map(Math.round),
    results_sha256: warm.hash,
    workload: { stride: STRIDE, runs: RUNS, seed: SEED, strategy: STRATEGY, ids: workload.map((e) => e.id) },
    commit,
    node: process.version,
    machine: `${os.cpus()[0]?.model} x${os.cpus().length}, ${os.platform()} ${os.arch()}`,
    captured_at: new Date().toISOString(),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${BASELINE_PATH}`);
} else if (baseline) {
  const pct = (medianMs / baseline.median_ms - 1) * 100;
  const same = baseline.results_sha256 === warm.hash;
  console.log(`baseline ${baseline.median_ms} ms (${baseline.commit?.slice(0, 10)}, ${baseline.machine}, node ${baseline.node})`);
  console.log(`delta ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%; results ${same ? "identical" : "DIFFERENT"}`);
  if (!same) process.exit(1);
} else {
  console.log("No baseline yet: run `pnpm bench:sim --update`.");
}
