# Regression harness

Local tools for catching score drift and perf regressions in the structured engine.

## Files

- `suite.jsonl` — frozen list of loadouts with expected scores. Committed; each line is one `{id, query, score, note}` entry so git diffs show score drift clearly.
- `perf-baseline.json` — median runtime per loadout under the reference build. Committed.
- `lib.mjs` — shared runner and I/O helpers.
- `generate-suite.mjs` — one-shot bootstrap (seeded, 500 loadouts).
- `run.mjs` — runs the suite, compares or updates scores.
- `add.mjs` — appends a single loadout with its captured score.
- `bench.mjs` — measures perf and compares to baseline.

## Workflow

### Unit tests

```sh
pnpm test                                                                           # every tests/unit/**/*.test.mjs
node --loader ./scripts/extensionless-loader.mjs --test tests/unit/<path>.test.mjs  # just one file
```

`tests/unit/` mirrors the source tree, one file per module, without the `packages/` prefix: `gakumas-tools/utils/simulator.js` is tested in `tests/unit/gakumas-tools/utils/simulator.test.mjs`, `packages/gakumas-engine/engine/Executor/index.js` in `tests/unit/gakumas-engine/engine/Executor.test.mjs`. Add a test to the file of the module it exercises; create a file only for a module that has none. Engine tests build their engine with `tests/unit/gakumas-engine/helpers.mjs`.

Fixture harnesses (`test:draft`, `test:memory`, `test:contest-loadout`, `test:rehearsal`, `test:regression`) take their mode as a flag, e.g. `pnpm test:draft --update`.

### Correctness

```sh
pnpm test:regression           # run suite, fail on any score mismatch
pnpm test:regression --update  # rewrite scores (after intentional behavior change)
pnpm regression:add "<query>" --id=<id> --note="<provenance>"
```

When `pnpm test:regression` fails, each mismatched line prints the expected and actual score — read the diff, decide whether the change was intentional. If yes, run `pnpm test:regression --update` and commit the updated `suite.jsonl`. If no, you have a regression to fix.

Add a loadout to the suite whenever a user reports a bug: it becomes a pinned test that prevents re-regression.

### Performance

```sh
pnpm bench           # compare median runtime against perf-baseline.json
pnpm bench --update  # rewrite baseline
```

Threshold: flags regressions greater than 10%. Re-baseline after an intentional perf change (either direction — both speedups and slowdowns get captured).

### Fidelity against real rehearsals

Users can share simulator-vs-rehearsal comparisons from the simulator's Rehearsal tab.

```sh
(cd gakumas-tools && pnpm comparisons export --since 2026-10-01) > comparisons.jsonl
pnpm fidelity comparisons.jsonl --runs 500   # re-simulate on the current engine, rank gaps by z-score
```

## Bootstrap (one-shot)

```sh
pnpm regression:bootstrap  # writes suite.jsonl with 500 seeded loadouts
pnpm bench --update        # captures initial perf baseline
```

The bootstrap script refuses to overwrite an existing `suite.jsonl` — once the suite contains hand-curated entries, preserving them matters.
