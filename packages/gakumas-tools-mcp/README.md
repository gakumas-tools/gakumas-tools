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

| Tool                       | What it does                                        |
| -------------------------- | --------------------------------------------------- |
| `gakumas_list_stages`      | Searches stages by name or ID, type and plan        |
| `gakumas_get_stage`        | Reads a stage's criteria, turn counts and effects   |
| `gakumas_simulate_loadout` | Plays a loadout on a contest or event stage, seeded |

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

Run `i` is seeded with `(seed + i) mod 2^32`, so the same input gives the same
scores, and more runs keep the earlier ones. Simulations take turns, since the
engine has one random stream.
