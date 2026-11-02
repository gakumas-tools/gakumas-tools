import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  compareLoadoutCandidates,
  createLoadoutEvaluator,
  loadoutStageConfig,
} from "../gakumas-tools/utils/loadoutOptimizer.js";

const USAGE =
  "Usage: pnpm optimize:loadout <candidates.json> [--runs N] [--validation-runs N] [--seed N] [--min-gain N]";

export async function main(args) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      runs: { type: "string", default: "50" },
      "validation-runs": { type: "string", default: "200" },
      seed: { type: "string", default: "610397104" },
      "min-gain": { type: "string", default: "0" },
    },
  });
  if (positionals.length != 1) throw new Error(USAGE);

  const { baseline, candidates, enterPercents = false } = JSON.parse(
    readFileSync(positionals[0], "utf8"),
  );
  for (const { loadout } of [baseline, ...candidates]) {
    loadoutStageConfig(loadout, enterPercents);
  }

  return compareLoadoutCandidates({
    baseline,
    candidates,
    evaluate: createLoadoutEvaluator(enterPercents),
    runs: Number(values.runs),
    validationRuns: Number(values["validation-runs"]),
    seed: Number(values.seed),
    minGain: Number(values["min-gain"]),
  });
}

if (import.meta.url == pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
