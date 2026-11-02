import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../../scripts/optimize-loadout.mjs";

const loadout = (card) => ({
  stageId: 1,
  params: [100, 200, 300, 50],
  pItemIds: [],
  skillCardIdGroups: [[card]],
  customizationGroups: [[{}]],
});

test("the CLI prints the same comparison on every run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "optimize-loadout-"));
  try {
    const file = join(dir, "candidates.json");
    writeFileSync(
      file,
      JSON.stringify({
        baseline: { id: "base", loadout: loadout(1) },
        candidates: [{ id: "upgraded", loadout: loadout(2) }],
      }),
    );
    const args = [file, "--runs", "10", "--validation-runs", "30"];

    const first = await main(args);
    assert.deepEqual(await main(args), first);
    assert.equal(first.selection.length, 2);

    const cli = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        "--loader",
        "./scripts/extensionless-loader.mjs",
        "scripts/optimize-loadout.mjs",
        ...args,
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), first);

    await assert.rejects(main([file, "--runs", "no"]), /runs must/);
    await assert.rejects(main([file, "--unknown"]), /Unknown option/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
