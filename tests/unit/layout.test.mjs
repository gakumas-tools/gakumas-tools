import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UNIT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(UNIT_DIR, "..", "..");

function sourceCandidates(modulePath) {
  const roots = [modulePath, join("packages", modulePath)];
  return roots.flatMap((root) =>
    [".js", ".mjs", "/index.js"].map((ext) => join(REPO_ROOT, root + ext)),
  );
}

test("every unit test file is named after the source module it tests", () => {
  const orphans = globSync("**/*.test.mjs", { cwd: UNIT_DIR })
    .filter((file) => file !== "layout.test.mjs")
    .filter((file) => {
      const modulePath = file.replace(/\.test\.mjs$/, "");
      return !sourceCandidates(modulePath).some(existsSync);
    });
  assert.deepEqual(orphans, []);
});

test("no unit test files sit outside tests/unit", () => {
  assert.deepEqual(globSync("tests/*.test.mjs", { cwd: REPO_ROOT }), []);
});
