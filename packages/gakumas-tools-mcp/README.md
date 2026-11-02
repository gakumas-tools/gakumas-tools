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

| Tool                            | What it does                                        |
| ------------------------------- | --------------------------------------------------- |
| `gakumas_list_stages`           | Searches stages by name or ID, type and plan        |
| `gakumas_get_stage`             | Reads a stage's criteria, turn counts and effects   |
| `gakumas_simulate_loadout`      | Plays a loadout on a contest or event stage, seeded |
| `gakumas_simulate_link_loadout` | Plays a deck per phase on a link contest, seeded    |
| `gakumas_search_entities`       | Searches cards, items, idols and more by name or ID |
| `gakumas_get_entity`            | Reads one of those with its parsed effects          |

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
`enterPercents` is true; event stages always take percentages. `supportBonus`
is a fraction. Zero IDs are empty slots.

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
