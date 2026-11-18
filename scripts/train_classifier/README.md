# Icon classifiers

Models classify a crop by similarity to an embedding of every reference icon in `gk-img`.

- New cards or p-items: `pnpm refresh:classifier` re-embeds the icons; no retraining. CI does this automatically (`.github/workflows/classifier-refresh.yml`) and opens a PR.
- Retrain (`pnpm train:classifier`) only when `pnpm evaluate:classifier` drops or new art looks unlike anything before, e.g. a new idol. Real screenshot crops in `.classifier-data/<p_items|skill_cards>/<class>/` are optional extra training data.
- Skill-card crops from the labelled fixtures: `CLASSIFIER_CROPS_OUT=.classifier-data/skill_cards pnpm test:contest-loadout`, then the same with `pnpm test:memory`. Only the screens `isTrainingScreen` picks (half, by file name; see `tests/classifierCrops.mjs`) are cut, so the other half scores the retrained model on screens it never saw.
