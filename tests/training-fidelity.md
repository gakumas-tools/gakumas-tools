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
- `plays[].actions[]`: each card played, by `cardId` and `name`, or a skipped
  action with `cardId: null`; `expected`,
  the state read from the screenshot after it; and `capture`, that
  screenshot's name. In `expected`, `heldCards` lists card IDs.

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
turn. The second play is replayed to its final 867. The first stops after
turn 8: on turn 9 休憩中のおやつ adds 69 in the game (410 → 479) but 79 in the
engine, which rounds 12 × 0.6 = 7.2 up to 8 before 全力's ×3, where the game's
69 fits 7 (7 × 3 × 3.28 = 68.9). One reading can't tell floor from round, so
the engine is unchanged.

`contest-rehearsal-s55-sena` replays an owned 学園生活 十王星南 memory with
ティーキャディー in stage 3. It checks the item's score and stamina recovery
after a 強気 active card, the two score hits of 学園一のアイドル, repeated
温存 → 強気 transitions, and a スパート moved to the held pile. Skipped
actions end the turn and restore stamina, including after a card leaves an
extra use available. The replay reaches the recorded final score of 794.

The `-sena-2` fixture uses the same memory with a different turn order and
draws, ending at 687. Its first stance is 強気, which gives no extra card
use or enthusiasm; ティーキャディー adds 33 score and restores 1 stamina.
Later it covers 温存 level 2 changing to 強気 (5 genki and 8 enthusiasm)
and the 強気 level 2 score multiplier.
