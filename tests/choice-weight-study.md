# Choice-weight study

`pnpm bench:choices` looks for weights that make `WeightedHeuristicStrategy` score higher than `HeuristicStrategy` in the engine. `WeightedHeuristicStrategy` scales five of `HeuristicStrategy`'s terms: buffs, score, stamina, hand size and cards used. With every weight at 1 it plays exactly as `HeuristicStrategy` does. It isn't in `STRATEGIES`, so the site and the MCP server don't use it.

## How it works

- **Profiles.** Each weight is 0.25, 0.5, 1, 2 or 4, which makes 3 125 profiles. The baseline is tried first and the rest in a fixed shuffled order, so a run stopped early has still tried a fair sample.
- **Decks.** The suite's contest decks are split in two by a hash of their P-items and cards, so decks with the same inventory land on the same side.
- **Seeds.** Each deck has its own block of 10 000 seeds, from 100 000 for training and from 10 000 000 for validation. A profile plays the same seeds as the baseline it's compared with.
- **Training.** Each profile is ranked by its mean relative gain over the baseline on the training decks, each deck counting once. The best profile for each plan is saved, the baseline winning ties, before any validation deck is played.
- **Validation.** Each plan's profile plays the validation decks of that plan. It passes the engine gate with at least 30 decks, a 95 % interval for its mean relative gain that's above 0, and no deck whose mean drops by more than 10 %.

## Running it

```sh
pnpm bench:choices --output /tmp/choice-study --candidates 1024 --train-runs 200 --validation-runs 1000 --max-minutes 300
```

Training stops after `--max-minutes`, and validation then runs on the profiles tried so far. Each finished profile is appended to `training.jsonl`, so a stopped run can be continued with `--resume` and the same options. `metadata.json` records the options, the decks and a hash of the data, engine and study sources; a resume with any of them changed is refused, and so is one after `validation.json` is written.

## Result of 2026-11-02

220 of 1 024 profiles were tried in the time given. The [report](reports/choice-weight-study-20261102.json) has the source hash, the decks, the selected profiles and every validation deck's result. Weights are buff / score / stamina / hand / cards used.

| Plan | Profile | Weights | Validation decks | Mean relative gain | 95 % interval | Worst deck | Engine gate |
| --- | ---: | --- | ---: | ---: | --- | ---: | --- |
| Sense | 162 | 1 / 1 / 4 / 2 / 0.25 | 111 | -0.1973 % | -0.5229 % to +0.1284 % | -8.3679 % | fail |
| Logic | 181 | 1 / 1 / 2 / 1 / 4 | 99 | +0.2877 % | +0.1008 % to +0.4746 % | -1.0730 % | pass |
| Anomaly | 53 | 1 / 0.5 / 4 / 2 / 1 | 57 | +0.8484 % | -0.4644 % to +2.1612 % | -16.8794 % | fail |

The Logic profile raised 67 deck means and lowered 32, by +43.08 points a deck on average. These are engine results only; nothing has been checked in game, and the default strategy is unchanged.

To try the same 220 profiles again:

```sh
pnpm bench:choices --output /tmp/choice-study-220 --candidates 220 --train-runs 200 --validation-runs 1000 --max-minutes 300
```

The study code has been rewritten since the report was made, so a new run records a different source hash.
