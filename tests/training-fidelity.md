# Training fidelity

`pnpm fidelity:training` replays plays captured in the game's trainings and
checks that the engine reaches every recorded state exactly.

Each fixture in `fixtures/ingame/` is one training. For each play the harness
starts from the captured initial state, fixes the turn order and multipliers
the game showed, and plays the recorded cards in order. After each card it
compares the engine's state at the next playable moment with what the game
showed. State carries over from card to card; nothing is reset to a recorded
value.

The harness hands the engine each card the play used, so draws and deck
composition aren't checked, and neither are raw parameters, NPC scores or rank
thresholds. Comparing whole stages and loadouts is `pnpm fidelity`'s job.

## Fixtures

- `initial`: the state before the first turn, checked before any card is
  played.
- `turnTypes`: the turn order the game showed.
- `displayedPercents`: the multiplier the game showed for each turn type.
- `plays[].actions[]`: each card played, by `cardId` and `name`; `expected`,
  the state read from the screenshot after it; and `capture`, that
  screenshot's name.

Screenshots stay out of git, under `screenshots/sources/ingame/`.

## Capturing

Record only settled values, never a score still counting up or a preview.
For a readable final score, take one shot right after the last card and
another about two seconds later; by nine seconds the result overlay has
blurred it.

The final shot comes before the last turn ends, so buffs that count down or
reset at the end of a turn still show their earlier values. Leave them out of
a play's last `expected`.

## 【試験研修3】好印象

Covers direct score, good impression scoring at the end of the turn, gaining
and extending good impression, costs paid partly or wholly with genki, and
fractional scores at 250%. The first play's final score is hidden behind the
result overlay, so it isn't recorded.

## 【試験研修4】やる気

Covers fixed stamina costs, costs paid with genki, gaining motivation, genki
gains at several motivation values, and genki-based scores at 250% and 400%.
Motivation doesn't count down, so each play's last `expected` checks it too.
