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

The `-2` fixtures are a second rehearsal with the same formation (2026-11-05
00:35), with other draws and turn types; the replay gives every turn's score
exactly (手毬 1,477, 清夏 967, ことね 2,915). Stage 2's effect fires on turns 6
and 10, and the game ticks good impression twice on turns 6–7 and 10–11.
`expected` is read after the next turn's start: 手毬's turn 1 concentration is
9 because 私の「初」の楽譜 adds 3 again at the start of turn 2.

`contest-rehearsal-s55-tsubame-2` is the same rehearsal's stage 3 (`stageId`
192), played by the default memory 学園生活 雨夜燕 with はばたくブローチ. Turns 5,
7 and 11 use several cards, so its actions give their `turn`, and a held card
(スパート, held on turn 2, used on turn 11) is taken from the held pile. Covers
温存/強気/全力 stance changes, preservation's 熱意 and extra card uses, full
power charge, and the brooch's 熱意追加 on the first direct switch to 強気.

`contest-rehearsal-s55-misuzu` and `-misuzu-2` are stage 3 played by an owned
memory, 学園生活 秦谷美鈴 3663 (400/200/300, 体力 25; panel 274/296/328%), with
休憩中のおやつ, in two rehearsals (2026-11-05 01:05 and 01:10; one fixture each,
since their turn types differ). They cover のんびり屋さん's
温存 → のんびり at each turn's start, のんびり's zero cost and zero score
(アッチェレランド scores 0), leaving のんびり for 強気 (元気 +5, 熱意 +10) and
for 全力 (元気 +5), and a card held under のんびり (スパート) used in the 全力
turn. The first and second plays are replayed to their final scores of 942
and 867. The `-3` and `-7` fixtures cover two more rehearsals. Together they
check that 休憩中のおやつ rounds 60% of cumulative full power down before
全力 and the turn multiplier: cumulative values of 12, 11 and 13 give base
scores of 7, 6 and 7, for score gains of 69, 54 and 63.

Further 美鈴 rehearsals exercise the same item with cumulative full power
values of 12 and 13 across all three turn types. A base of 7.8 gives 58 at
274% and 69 at 328%, separating floor from round-to-nearest. Each replay
carries state from the first turn; one stops after turn 8, before skipped
actions its harness cannot replay.

The item also scores with a base of 8.4 on different full-power turns, at
296% and 328%, and 13.2 after two full-power entries. The latter keeps cumulative charge across
both entries and checks card growth applied at each switch.
