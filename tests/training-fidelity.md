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

- `initial`: the state before the first card, after the first turn's start
  effects, checked before any card is played.
- `startingStamina` (optional): the stamina parameter, when start effects
  already spent some of it, so `initial.stamina` differs.
- `pItemIds` (optional): the P-items the play had.
- `stageId` (optional): a stage whose own effects apply, from `stages.csv`.
- `skillCardIds` (optional): the deck, when a once-per-stage card was played
  twice from two copies. Otherwise one copy of each card the play used.
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

## Contest S55 rehearsals

Three units from one free contest rehearsal (ver 3.5.0, 2026-11-05), read from
ステージ詳細 → 詳細ログ, which shows each turn's type %, the card used and the
score and buffs before and after. `displayedPercents` is the % on the
formation panel. Covers concentration, good condition's ×1.5, P-items at the
start of the stage and of a turn, multi-hit cards, and a once-per-stage card
taken from both the main and the sub memory's deck. Stage 2 adds good
impression at the end of each turn, motivation's genki bonus, and the
stage's own effect (`stageId` 191), which on every fourth direct good
impression gain adds 7 and doubles the next tick. The ranking bonus added to the top
unit isn't part of the replay.

`contest-rehearsal-s55-kotone-2` is a second rehearsal with the same formation
(2026-11-05 00:35), with other draws and turn types. Its stage effect fires on
turns 6 and 10, and the game ticks good impression twice on turns 6–7 and
10–11; the replay gives all twelve turn scores (final 2,915) exactly.
