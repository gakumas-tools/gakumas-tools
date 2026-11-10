# gakumas-tools-mcp

A local MCP server over stdio that looks up stages and plays loadouts on them
with the simulator. Stages and scores come from this repository's data and
engine, not from the game.

## Running

Run `pnpm install` in the checkout, then point the MCP client at `bin.js` with
Node:

```json
{
  "mcpServers": {
    "gakumas-tools": {
      "command": "node",
      "args": ["/path/to/gakumas-tools/packages/gakumas-tools-mcp/bin.js"]
    }
  }
}
```

Start it with `node`, not `pnpm run`: pnpm prints to stdout, which carries the
MCP messages.

## Tools

| Tool                            | What it does                                             |
| ------------------------------- | -------------------------------------------------------- |
| `gakumas_list_stages`           | Searches stages by name or ID, type, plan and season     |
| `gakumas_get_stage`             | Reads a stage's criteria, turn counts and effects        |
| `gakumas_simulate_loadout`      | Plays a loadout on a contest or event stage, seeded      |
| `gakumas_compare_loadouts`      | Plays several decks on the same seeds and pairs them     |
| `gakumas_optimize_loadout`      | Fills a loadout's open slots by hill climbing            |
| `gakumas_simulate_link_loadout` | Plays a deck per phase on a link contest, seeded         |
| `gakumas_search_entities`       | Searches cards, items, idols and more by name or ID      |
| `gakumas_get_entity`            | Reads one with its effects, and a p-idol's signatures    |

A simulation takes the website's loadout fields:

```json
{
  "stageId": 187,
  "params": [2700, 2000, 800, 50],
  "pItemIds": [],
  "skillCardIdGroups": [[1, 13]],
  "seed": 12345,
  "runs": 10
}
```

`params` are Vo, Da, Vi and stamina. Contest stages take raw parameters unless
`enterPercents` is true; event stages always take percentages. A contest left
without `params` plays the website's defaults: 2700, 2000 and 800 by the
stage's criteria, and 50 stamina. `supportBonus` is a fraction, 0.1 unless
given, as on the website. Zero IDs are empty slots. The result has the params
it played and a `simulatorUrl` that opens the loadout on the website.

`gakumas_compare_loadouts` takes the same stage fields once and a list of
`loadouts`, each with its own `pItemIds`, `skillCardIdGroups` and
`customizationGroups`. Every deck plays the same seeds, so each one after the
first reports `vsFirst`: its mean difference from the first deck and that
difference's standard error. Shared seeds cancel most of the luck, so a
difference several standard errors from zero is real for this simulator.

`gakumas_optimize_loadout` builds a deck for a contest or event stage:

```json
{ "stageId": 190, "pIdolId": 32, "seed": 1000 }
```

It starts from two empty memories and four empty P-item slots; `pIdolId`
puts that p-idol's upgraded signature card in memory 1 and its P-item in the
first slot, and nonzero cards and P-items given in `skillCardIdGroups` and
`pItemIds` stay where they are. Each pass tries every card of `cardPool` in
every open card slot and every P-item of `pItemPool` in every open P-item
slot, keeping a swap when it raises the mean over `runs` shared seeds, until
a pass keeps nothing or `timeLimitSeconds` runs out. The pools default to
every upgraded card and every stage P-item of the stage's plan, or the
loadout's when the stage is free, and free ones. Swaps that break the rules
are skipped: a unique card once with its upgrade, a P-item once, one
p-idol's signature cards per memory and no more p-idols' signatures than
memories.

The search mean flatters the deck it picked, so the result also replays it
for `holdoutRuns` on seeds the search didn't use; that holdout mean is the
one to quote. Searched cards get no customizations, since the data doesn't
say how many a card can hold. A search takes minutes, reports progress to
clients that ask for it, and holds the simulator queue until it ends.

A link contest takes Vo, Da and Vi once, as displayed percentages, and a deck
and stamina for each of the stage's phases:

```json
{
  "stageId": 121,
  "params": [1000, 800, 600],
  "phases": [
    { "stamina": 50, "skillCardIdGroups": [[15, 17, 1, 13]] },
    { "stamina": 55, "skillCardIdGroups": [[19, 21, 13, 9]] },
    { "stamina": 60, "skillCardIdGroups": [[370, 376, 13, 374]] }
  ],
  "seed": 12345,
  "runs": 10
}
```

Card and item IDs come from `gakumas_search_entities`, which searches the
names in the data, mostly Japanese. A card's summary lists the customizations
it can take; `customizationGroups` gives each card slot a map of customization
ID to level, up to that customization's `max`. Cards and items the website
hides can't be looked up or simulated.

Run `i` is seeded with `(seed + i) mod 2^32`, so the same input gives the same
scores, and more runs keep the earlier ones. Simulations take turns, since the
engine has one random stream.
