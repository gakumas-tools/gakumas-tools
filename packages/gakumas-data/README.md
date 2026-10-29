# gakumas-data

Gakumas data with effects in a block-structured, AST-parsed DSL.

## Usage

```js
import { SkillCards, PItems, Customizations } from 'gakumas-data';

const card = SkillCards.getById(720);
const item = PItems.getById(101);
const cust = Customizations.getById(86);
```

## Effect DSL

See **[Effects.md](./Effects.md)** for the full DSL reference — phases,
conditions, target rules, modifiers, anchors, customization patches, and
the complete inventory of state variables and actions.

## Data files

CSVs under `csv/` are the source of truth and are imported directly. Webpack
(`gakumas-tools/loaders/csvLoader.js`) and the Node test loader
(`scripts/extensionless-loader.mjs`) turn them into records with
`utils/csv.js`, which converts `TRUE`/`FALSE` to booleans and digit-only
fields to integers.

Each CSV row's DSL columns (`conditions`, `cost`, `actions`, `effects`) are
parsed via `deserializeEffectSequence` or `deserializePatchSequence` the first
time a lookup returns the row, so importing the package parses nothing.

## Validation

Every DSL field is validated against a schema of known phases, variables,
actions, and target identifiers:

```
pnpm validate:data
```

Unknown references fail with a precise error pointing at the entity and
column.

## Stamina calculation

Stamina constants in `utils/stamina.js` must come from player-visible in-game
screens: each P-idol's status/upgrade panels, idol affection and achievement
bonuses, and the support-card level table. Public transcriptions are useful
cross-checks:

True End stamina rewards are permanent achievements, not properties of the
scenario currently being produced. Pass every earned True End scenario to the
calculator so their rewards are summed.

- [P-idol status and progression](https://seesaawiki.jp/gakumasu/d/%A5%D7%A5%ED%A5%C7%A5%E5%A1%BC%A5%B9%A5%A2%A5%A4%A5%C9%A5%EB)
- [affection and True End achievements](https://seesaawiki.jp/gakumasu/d/%A5%A2%A5%C1%A1%BC%A5%D6%A5%E1%A5%F3%A5%C8)
- [Sensei support-card level table](https://seesaawiki.jp/gakumasu/d/%A4%AD%A4%DF%A4%CF%A1%A2%BC%AB%CB%FD%A4%CE%C0%B8%C5%CC%A4%C7%A4%B9)

Keep future and preview P-idols out of the confirmed ID ranges until their
values are visible in game. Add exceptional per-P-idol values as explicit
overrides instead of extending the general entity CSV schema.
