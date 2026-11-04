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

`contest-rehearsal-s55-kotone-4866` is stage 2 played by the owned memory
カワイイ♡はじめました 藤田ことね 4866 alone (204/483/518, 体力 27; panel
329/341/551%) with お気にのスニーカー and 寝心地は良好. The stage's effect fires
on turns 7 and 12 and doubles their good impression ticks, ending at 1,759.
寝心地は良好 never fires in the log, and the engine agrees. The
`contest-rehearsal-s55-kotone-4536` fixture is the same idol's 4536 memory
(242/519/385, 体力 27; panel 376/363/442%) with お気にのスニーカー and upgraded
Colorful Cute!+ and 思い出し笑い+. The stage's effect fires on turns 4 and 10, and
the replay matches every turn to the final 2,029.

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

The `-sena-3` fixture is a third rehearsal with the same memory and other
draws and turn types, ending at 692. ティーキャディー fires once, after
turn 2's はげしく (130 → 195). The play has five two-card turns and a
スパート held on turn 5, and イメージの基本 changes 強気 back to 温存 on turns
7, 9 and 11. The `-sena-4` fixture is a fourth rehearsal ending at 790, with
ティーキャディー after turn 2's せーのっ！ (85 → 135, 体力 22 → 23), six
two-card turns and a skipped extra use on turn 11 (体力 5 → 7). The `-sena-5`
fixture is a fifth rehearsal ending at 801: ティーキャディー fires after turn
1's スターライト (59 → 92, 体力 19 → 20), and turn 12 is skipped at 体力 0
(0 → 2).

`contest-rehearsal-s55-saki` is stage 1 played by an owned memory, Fighting My
Way 花海咲季 5289 (343/434/499, 体力 32; panel 462/362/775%), in a rehearsal
on 2026-11-05. It covers 星のリトルプリンス's 元気 +2 at the start of each
visual turn, 共に戦うタオル's extra card use and 好調 +1 after the first active
card (turn 3 plays 情熱ターン and then 振る舞いの基本), 元気 paying a cost
before 体力, and 好調 counting down from 5 to 0 by turn 8. Every turn's score
matches, to the final 1,140.

The `-saki-2` fixture is a second rehearsal with other draws and turn
types, ending at 899. タオル fires after ファンサ on turn 2, and the extra use
plays 挑戦 under 好調 (56 → 246); 眼力's 元気 +6 then pays for later costs.

`contest-rehearsal-s55-ume` is stage 2 (`stageId` 191) played by an owned
memory, アイドル、はじめっ！ 花海佑芽 3741 (266/311/249, 体力 30; panel
360/236/290%), in a rehearsal on 2026-11-05. It covers 天川ラーメン巡り's
extra card use on the first vocal turn, 柴犬ポシェット's 元気 +5 at the start of
turns 2 and 4 plus motivation's bonus (9 → 18), 打倒お姉ちゃん and 気分転換
scoring from 元気, and the stage's effect on turn 8 (好印象 +7, then a doubled
tick, 82 → 170). Every turn's score matches, to the final 656.

`contest-rehearsal-s55-ume-3663` is the same stage played by 学園生活 花海佑芽
3663 (300/400/200, 体力 25; panel 389/272/251%) with テクノドッグ.
The item adds 2 motivation after turn 2's あふれる思い出 (6 → 8). Motivation then
builds to 20, and ありがとうの言葉 (16 → 122), 気分転換 with 95 元気
(130 → 395 with the tick) and 未完の大器 (元気 145 at the end) all read 元気. Every turn matches, to
the final 424. The `-ume-3663-2` fixture is a second rehearsal (other draws,
final 501): テクノドッグ fires on turn 1, three えいえいおー build motivation to 23,
and 気分転換 with 164 元気 scores 412. The log's 元気 「before」 value is
after the card's cost is paid (turn 3: 7 − 2 = 5 → 14). The `-ume-3663-3`
fixture is a third rehearsal ending at 800, where ありがとうの言葉 (24 → 183) and
気分転換 with 156 元気 (189 → 796) carry the score. The `-ume-3663-4` fixture
is a fourth rehearsal ending at 616: テクノドッグ fires after turn 1's もう少しだけ,
未完の大器 raises 元気 39 → 82, 気分転換 with 106 元気 scores 289 (78 → 367)
and ありがとうの言葉 adds 249. The `-ume-3663-5` fixture is a fifth rehearsal
ending at 839, with 好印象 ticks from two 目線の基本 (0 → 6 → 12 → 15, and
15 → 21 later) and 気分転換 with 165 元気 scoring 642 (193 → 835) before the
last tick.

`contest-rehearsal-s55-saki-3663` is stage 1 played by 学園生活 花海咲季 3663
(200/300/400, 体力 25; panel 258/236/505%) with ばくおんライオン. 好調 from
turn 4's 振る舞いの基本 lets the item add 117 at the start of turn 5 (44 → 161),
and 試行錯誤's two hits there use concentration 9 under 好調 (161 → 425). Every
turn matches, to the final 588. The `-saki-3663-2` fixture is a second
rehearsal with other draws and turn types, ending at 635. ばくおんライオン adds
55 at the start of turn 5 (56 → 111), and 挑戦 with concentration 12 scores
283. The `-saki-3663-3` fixture is a third rehearsal ending at 593: 好調 from
turn 2's 振る舞いの基本 lets ばくおんライオン add 61 at the start of turn 3, and
挑戦 with concentration 5 under 好調 scores 228 (61 → 289). The `-saki-3663-4`
fixture is a fourth rehearsal ending at 330, where the item adds 37 at the
start of turn 3 (56 → 93).

`contest-rehearsal-s55-temari-5319` is stage 1 (`stageId` 190) played by 一匹狼
月村手毬 5319 with a 学園生活 手毬 sub (819/339/392, 体力 35; panel
873/284/576%). Its turn 6 plays 練習再開！+ (hand exchange, extra use) and then
バランス感覚 with 5 turns left. That second card triggers the stage's effect
(集中 9 → 13 and 集中強化, then 13 → 16), and the boosted concentration carries
ローン・ウルフ (412 → 1,234) and the rest to the final 2,000. Without the
stage's effect the replay gives 1,654.

The `-temari-5319-2` fixture is a second rehearsal with the same formation and
other draws, ending at 1,380. Here 練習再開！+ comes on turn 5. Its extra use
plays アドリブ with 6 turns left, so the stage's effect doesn't fire. The
`-temari-5319-3` fixture is a third rehearsal ending at 2,490, and the second
one to trigger the stage's effect: turn 6's 練習再開！+ draws the deck's other
準備運動, which as the turn's second card with 5 turns left gains 集中 14 → 18
and 集中強化 before its own 18 → 20. The `-temari-5319-4` fixture is a fourth
rehearsal ending at 1,666, another negative case: 練習再開！+ comes on turn 3,
and its extra use plays ファンサ with 8 turns left.
