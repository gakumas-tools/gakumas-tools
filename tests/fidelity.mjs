import { readFileSync } from "node:fs";
import { PIdols, SkillCards, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  STRATEGIES,
  StageConfig,
  StageEngine,
  StagePlayer,
} from "gakumas-engine";
import {
  compareScores,
  likelyMisPick,
} from "../gakumas-tools/utils/rehearsalComparison.js";
import { silenceConsole } from "./lib.mjs";

const args = process.argv.slice(2);
const VALUE_OPTIONS = ["--runs", "--max-gap-pct", "--min-rehearsals"];
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = parseInt(option("--runs") ?? 200, 10);
const MAX_GAP_PCT = option("--max-gap-pct");
const MIN_REHEARSALS = parseInt(option("--min-rehearsals") ?? 3, 10);
const asJson = args.includes("--json");
const file = args.find(
  (a, i) => !a.startsWith("--") && !VALUE_OPTIONS.includes(args[i - 1]),
);

if (!file) {
  console.error(
    "Usage: pnpm fidelity <comparisons.jsonl> [--runs N] [--json] [--max-gap-pct N [--min-rehearsals N]]",
  );
  process.exit(1);
}

async function simulate(loadout, enterPercents) {
  const stage = new StageConfig(Stages.getById(loadout.stageId));
  const config = new IdolStageConfig(
    new IdolConfig(loadout),
    stage,
    enterPercents,
  );
  const engine = new StageEngine(config);
  const strategy = new STRATEGIES.HeuristicStrategy(engine);
  engine.strategy = strategy;
  const scores = [];
  for (let i = 0; i < RUNS; i++) {
    scores.push((await new StagePlayer(engine, strategy).play()).score);
  }
  return scores;
}

function describe(loadout) {
  const stage = Stages.getById(loadout.stageId);
  const cardId = loadout.skillCardIdGroups?.[0]?.find(
    (id) => SkillCards.getById(id)?.sourceType == "pIdol",
  );
  const pIdol = PIdols.getById(SkillCards.getById(cardId)?.pIdolId);
  return {
    stage: stage ? `${stage.season}-${stage.stage}` : String(loadout.stageId),
    plan: stage?.plan,
    pIdol: pIdol ? `${pIdol.id} ${pIdol.title}` : "?",
  };
}

const unique = new Map();
for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
  const c = JSON.parse(line);
  unique.set(
    JSON.stringify([c.loadout, !!c.enterPercents, c.rehearsal.scores]),
    c,
  );
}
const comparisons = [...unique.values()];
if (!comparisons.length) {
  console.error(`No comparisons in ${file}`);
  process.exit(1);
}
const sources = new Set(comparisons.map((c) => c.userHash || c.ipHash));

const restore = silenceConsole();
const results = [];
try {
  for (const c of comparisons) {
    const simScores = await simulate(c.loadout, c.enterPercents);
    const gap = compareScores(simScores, c.rehearsal.scores);
    const misPick = likelyMisPick(
      gap.simMean,
      c.rehearsal.grid,
      c.rehearsal.stage,
      c.rehearsal.slot,
    );
    results.push({
      id: c._id,
      ...describe(c.loadout),
      n: gap.n,
      submittedDiffPct: c.simStats && c.simStats.mean / gap.rehearsalMean - 1,
      diffPct: gap.diffPct,
      marginPct: gap.marginPct,
      z: gap.marginPct ? (gap.diffPct / gap.marginPct) * 1.96 : 0,
      misPick: misPick && `${misPick.stage}-${misPick.slot}`,
    });
  }
} finally {
  restore();
}

results.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

const pct = (v) => (v == null ? "    -" : `${(v * 100).toFixed(1)}%`);
if (asJson) {
  for (const r of results) console.log(JSON.stringify(r));
} else {
  console.log(
    `${comparisons.length} unique comparisons from ${sources.size} sources\n`,
  );
  console.log("stage  plan     n  submitted     now  ±95%     z  pick?  p-idol");
  for (const r of results) {
    console.log(
      [
        r.stage.padEnd(6),
        (r.plan || "").padEnd(7),
        String(r.n).padStart(3),
        pct(r.submittedDiffPct).padStart(9),
        pct(r.diffPct).padStart(7),
        pct(r.marginPct).padStart(5),
        r.z.toFixed(1).padStart(5),
        (r.misPick || "").padStart(6),
        ` ${r.pIdol}`,
      ].join(" "),
    );
  }
  const byPlan = Object.groupBy(
    results.filter((r) => !r.misPick),
    (r) => r.plan,
  );
  console.log("\nMean gap by plan, likely mis-picks excluded:");
  for (const [plan, rows] of Object.entries(byPlan)) {
    const mean = rows.reduce((a, r) => a + r.diffPct, 0) / rows.length;
    console.log(`  ${plan}: ${pct(mean)} over ${rows.length}`);
  }
}

if (MAX_GAP_PCT != null) {
  const maxGap = parseFloat(MAX_GAP_PCT) / 100;
  const failures = results.filter(
    (r) => r.n < MIN_REHEARSALS || Math.abs(r.diffPct) > maxGap,
  );
  for (const r of failures) {
    console.error(`${r.id ?? r.stage}: ${r.n} rehearsals, ${pct(r.diffPct)} gap`);
  }
  console.error(
    `Fidelity gate: ${failures.length ? "FAIL" : "PASS"} ` +
      `(gap within ±${MAX_GAP_PCT}%, at least ${MIN_REHEARSALS} rehearsals each)`,
  );
  if (failures.length) process.exitCode = 1;
}
