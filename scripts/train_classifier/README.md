# Icon classifiers

Models classify a crop by similarity to an embedding of every reference icon in `gk-img`.

- New cards or p-items: `pnpm refresh:classifier` re-embeds the icons; no retraining. CI does this automatically (`.github/workflows/classifier-refresh.yml`) and opens a PR.
- Retrain (`pnpm train:classifier`) only when `pnpm evaluate:classifier` drops or new art looks unlike anything before, e.g. a new idol. Real screenshot crops in `.classifier-data/<p_items|skill_cards>/<class>/` are optional extra training data.
- Skill-card crops from the labelled fixtures: `CLASSIFIER_CROPS_OUT=.classifier-data/skill_cards pnpm test:contest-loadout`, then the same with `pnpm test:memory`. Only the screens `isTrainingScreen` picks (half, by file name; see `tests/classifierCrops.mjs`) are cut, so the other half scores the retrained model on screens it never saw.

## The covered class (skill cards)

On short screens the game's nav pill lies across the second row of a memory's cards, and what shows (the cost and a strip of frame) doesn't name the card. The skill card model has a class `-1` for that: training draws the pill over samples (`_draw_nav_pill`), and a sample it covers at least `NAV_PILL_COVERED_FRACTION` of is trained as `-1`. Its gallery entry is the mean embedding of `COVERED_REFERENCE_IDS`' icons with a pill drawn across them (`prepare.draw_covered`), so `refresh` keeps it without training. Only the memory import reads it (`keepCovered`): the slot stays empty and the memory is flagged for the player. Other readers never get it.
