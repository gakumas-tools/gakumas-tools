import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const comparison = {
  _id: "synthetic",
  loadout: {
    stageId: 1,
    params: [100, 200, 300, 50],
    pItemIds: [],
    skillCardIdGroups: [[1]],
    customizationGroups: [[{}]],
  },
  rehearsal: { scores: [1e12, 1e12, 1e12] },
};

function fidelity(lines, ...args) {
  const dir = mkdtempSync(join(tmpdir(), "fidelity-"));
  const file = join(dir, "comparisons.jsonl");
  writeFileSync(file, lines.map((line) => JSON.stringify(line) + "\n").join(""));
  try {
    return spawnSync(
      process.execPath,
      [
        "--no-warnings",
        "--loader",
        "./scripts/extensionless-loader.mjs",
        "tests/fidelity.mjs",
        file,
        "--runs",
        "2",
        "--json",
        ...args,
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
}

test("without a gap target, fidelity only reports", () => {
  assert.equal(fidelity([comparison]).status, 0);
});

test("fidelity fails a gap past the target and passes one within it", () => {
  const failed = fidelity([comparison], "--max-gap-pct", "5");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Fidelity gate: FAIL/);
  assert.equal(JSON.parse(failed.stdout).id, "synthetic");
  assert.equal(fidelity([comparison], "--max-gap-pct", "100").status, 0);
});

test("fidelity fails a comparison with too few rehearsals", () => {
  const result = fidelity(
    [comparison],
    "--max-gap-pct",
    "100",
    "--min-rehearsals",
    "4",
  );
  assert.equal(result.status, 1);
});

test("fidelity fails an empty comparisons file", () => {
  assert.equal(fidelity([]).status, 1);
});
