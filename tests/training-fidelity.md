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
寝心地は良好 never fires in the log, and the engine agrees. Its `-2` fixture is
a second play, where the effect fires on turns 4 and 8 (with ラブリーウインク
both times) and the play ends at 1,930. Its `-3` fixture is a third, with the
effect on turns 6 and 10 (ラブリーウインク again) and お気にのスニーカー on turn
4, ending at 2,184. The
`contest-rehearsal-s55-kotone-4536` fixture is the same idol's 4536 memory
(242/519/385, 体力 27; panel 376/363/442%) with お気にのスニーカー and upgraded
Colorful Cute!+ and 思い出し笑い+. The stage's effect fires on turns 4 and 10, and
the replay matches every turn to the final 2,029. The
`contest-rehearsal-s55-kotone-5334-alone` fixture is the 5334 memory without
the 5364 sub (269/627/444, 体力 36; panel 411/422/498%); the stage's effect
fires on turns 6 and 10, ending at 2,142. Its `-2` fixture is a second play
of the same formation, with different draws and turn types (表現の基本 on turn
3); the effect again fires on turns 6 and 10, ending at 2,249. The `-3` fixture
is a third play where the effect fires only on turn 6, ending at 1,735 with
元気な挨拶 and 気分転換. The `-4` fixture is a fourth play with the effect on
turns 6 and 10, ending at 2,062. The `-5` fixture is a fifth, with four
幸せな時間 and the effect on turns 6 and 10, ending at 2,536.

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

`contest-rehearsal-s55-misuzu-rehearsal-20` is a later play of the same memory,
replayed to the end of turn 8 (164, with turn 9's switch to 全力). On turn 9
休憩中のおやつ adds 63 after each of two イメージの基本 in the game
(164 → 227 → 290) but 72 in the engine: again 12 × 0.6 = 7.2, where 7 fits the
game (7 × 3 × 2.96 = 62.2) and the engine's 8 doesn't. The fixture stops there,
and the engine is unchanged in this branch. The `-misuzu-rehearsal-21` fixture
is replayed to its final 733: スパート is held on turn 4 and used in turn 9's
全力 turn (342 → 653), and 休憩中のおやつ adds 80 after that turn's
イメージの基本 at a cumulative 全力値 of 15. 15 × 0.6 = 9 is whole, so this
play can't tell floor from rounding up. The `-misuzu-rehearsal-22` fixture
stops after turn 8 (119, with turn 9's switch to 全力): on turn 9, a visual
turn, 休憩中のおやつ adds 69 after ハッピー♪ at a cumulative 全力値 of 12
(119 → 188), where the engine adds 79. 7 fits the game (7 × 3 × 3.28 = 68.9)
and the engine's 8 doesn't. The `-misuzu-rehearsal-23` fixture is replayed to
its final 808: 全力 comes on the last turn, where the held スパート scores
311 (497 → 808), and no preservation card is played under 全力, so
休憩中のおやつ never fires. The `-misuzu-rehearsal-24` fixture stops after turn
8 (247, with turn 9's switch to 全力): on turn 9, a visual turn, 休憩中のおやつ
adds 69 after イメージの基本 at a cumulative 全力値 of 12 (493 → 562), where the
engine adds 79, as in rehearsal 22. The `-misuzu-rehearsal-25` fixture stops
after turn 6 (296, with turn 7's switch from 強気 to 全力): on turn 7, a vocal
turn, 休憩中のおやつ adds 58 after イメージの基本 at a cumulative 全力値 of 13
(379 → 437), where the engine adds 66. 13 × 0.6 = 7.8, and 7 fits the game
(7 × 3 × 2.74 = 57.5) while 8 doesn't, so the game doesn't round to nearest
either. The `-misuzu-rehearsal-27` fixture is replayed to its final 911: turn
9's アッチェレランド takes 全力値 to 12, and the switch to 全力 at the start of
turn 10 keeps the extra 2 (12 → 2). No preservation card is played under 全力,
so 休憩中のおやつ never fires. The `-misuzu-rehearsal-30` fixture is replayed to
its final 1,070: turn 9's アッチェレランド takes 全力値 to exactly 10, the
held スパート scores 288 in the 全力 turn (659 → 947), and again no
preservation card is played under 全力. The `-misuzu-rehearsal-31` fixture is
replayed to its final 573: 全力 comes early, on turn 7, where the held スパート
scores 246 (327 → 573). The stance then goes back to のんびり, and turns 8–12,
アピールの基本 twice included, add no score. The `-misuzu-rehearsal-32` fixture is
replayed to its final 926: turn 8's メントレの基本 takes 全力値 to 11, the
switch to 全力 on turn 9 keeps the extra 1, and that turn's three cards score
778 (148 → 926). The `-misuzu-rehearsal-33` fixture also ends at 573, with
another play: 全力 on turn 7 again, where the held スパート scores 222 (351 →
573) and the extra card use is skipped at 体力 0 (0 → 2). The `-misuzu-rehearsal-34`
fixture is replayed to its final 766: ジャストアピール scores 0 under のんびり
on turn 6, and in turn 9's 全力 two アピールの基本 and the held スパート score
602 (164 → 766). The `-misuzu-rehearsal-35` fixture is replayed to its final
644: turn 8's アッチェレランド takes 全力値 to 11, the switch to 全力 on turn 9
keeps the extra 1, and that turn's アピールの基本 and held スパート score 480. The
`-misuzu-rehearsal-36` fixture stops after turn 8 (267, with turn 9's switch to
全力): on turn 9, a visual turn, 休憩中のおやつ adds 69 after イメージの基本 at a
cumulative 全力値 of 13 (464 → 533), where the engine adds 79. 13 × 0.6 = 7.8,
and 7 fits the game (7 × 3 × 3.28 = 68.9) while 8 doesn't, as in rehearsal 25
at vocal. The `-misuzu-rehearsal-37` fixture stops after turn 8 (132, with
turn 9's switch to 全力, 全力値 12 → 2): on turn 9, a dance turn, 休憩中のおやつ
adds 63 after ハッピー♪ at a cumulative 全力値 of 12 (301 → 364), where the
engine adds 72, as in rehearsal 20. The `-misuzu-rehearsal-38` fixture is
replayed to its final 916: turn 2's ハッピー♪ raises 温存 to stage 2, so turn
3's はげしく gives 熱意 8, and turn 10's 全力 (全力値 11 → 1) scores 659. The `-misuzu-rehearsal-39`
fixture is replayed to its final 759: two アピールの基本 and the held スパート
score 649 in turn 9's 全力. The `-misuzu-rehearsal-40` fixture is replayed to
its final 430: はげしく on turn 2 goes straight from no stance to 強気 (0 → 83),
and turn 9's 全力 scores 347. The `-misuzu-rehearsal-41` fixture is replayed to
its final 231: on turn 9, a dance turn, 休憩中のおやつ adds 80 after イメージの基本
at a cumulative 全力値 of 15 (151 → 231). 15 × 0.6 = 9 is whole, so the engine
agrees, as in rehearsal 21. The `-misuzu-rehearsal-105` fixture is replayed to
its final 832 with 全力 only on the last turn (12, dance): アッチェレランド and
the スパート held since turn 8 score 489, then 休憩中のおやつ adds 80 after
イメージの基本 at a cumulative 全力値 of 15 (752 → 832). The
`-misuzu-rehearsal-111` fixture is replayed to its final 654: no 温存 card is
used in turn 9's 全力, so おやつ never fires, and after 全力 the stance goes
through 温存 to のんびり, where turn 11's アピールの基本 scores 0.

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
(0 → 2). The `-sena-6` fixture is a sixth rehearsal ending at 841, with
ティーキャディー after turn 4's せーのっ！ (130 → 215, 体力 21 → 22) and a
skipped last turn. The `-sena-7` fixture is a seventh rehearsal ending at 708:
ティーキャディー after turn 3's せーのっ！ (153 → 243, 体力 21 → 22), three
two-card turns, スパート held on turn 8 and never used, and a skipped turn 10
(0 → 2). The `-sena-8` fixture is an eighth rehearsal ending at 734:
ティーキャディー inside turn 3's はげしく (130 → 195, 体力 22 → 23), six
two-card turns, スパート held on turn 7, a skipped extra use on turn 10 and a
skipped turn 11. The `-sena-9` fixture is a ninth rehearsal ending at 778:
ティーキャディー inside turn 2's はげしく, スターライト from 温存 stage 2 on turn
5 (熱意 8), スパート held on turn 6, and the last extra use and turn 12
skipped. The `-sena-10` fixture is a tenth rehearsal ending at 1,036, the
highest so far: turn 6's はげしく leaves 温存 stage 2 (熱意 8), and its extra use
plays せーのっ！, which raises 強気 from stage 1 to stage 2 within one turn
(475 → 699).

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
and its extra use plays ファンサ with 8 turns left. The `-temari-5319-5`
fixture (1,291) is a third negative case: the extra use plays 準備運動 on turn 4
with 7 turns left, and turn 10 is skipped. The `-temari-5319-6` fixture
(1,207) is a fourth: the extra use plays 表情の基本 on turn 3 with 8 turns left.
私の「初」の楽譜 fires at the start of turns 1 and 2 and not again (its limit is
2), and turn 8 is skipped. The `-temari-5319-7` fixture (1,403) is a fifth:
練習再開！+ on turn 2, with 大声援 as its extra use and 9 turns left. The
`-temari-5319-8` fixture (1,335) is a sixth: 準備運動 as turn 4's extra use with
7 turns left. The `-temari-5319-9` fixture (1,773) is a seventh: 大声援 as turn
4's extra use with 7 turns left.

`contest-rehearsal-s55-temari-5613` is stage 1 played by another owned 一匹狼
月村手毬 memory, 5613, with the same 学園生活 sub (858/480/308, 体力 35; panel
882/351/462%, campaign-s26-mari5613-panel.png). It plays one card a turn, so the
stage's effect stays off; 飛躍 with concentration 12 under 好調 hits twice
(286 → 622 → 984) and the play ends at 1,786. Its `-2` fixture is a second
play ending at 2,065, with 飛躍 on turn 9 at concentration 14 (1,314 → 2,065).
Its `-3` fixture is a third, ending at 1,444: three バランス感覚 build
concentration to 18 before トークタイム (395 → 995) and 飛躍.

`contest-rehearsal-s55-seika-5469` is stage 1 played by the owned memory
Tame-Lie-One-Step 紫雲清夏 5469 alone (225/834/300, 体力 30; panel
272/463/394%) with ゲーセンの戦利品 and 夢にあふれた大荷物. The latter gives an
extra card use on the first dance turn (turn 4: 軽い足取り, then 挑戦 237 → 446),
with 7 turns left, so the stage's effect stays off. Turns 9 and 10 are skipped
at 体力 0, and the play ends at 885. The `-seika-5469-2` fixture is the same
rehearsal's second play (other draws), where the extra use comes on turn 3 with
8 turns left, ending at 957. The `-seika-5469-3` fixture is a third play where
the first dance turn is turn 7, with 4 turns left: the extra use's 決めポーズ
triggers the stage's effect (集中 7 → 11 and 集中強化), ending at 769. The
`-seika-5469-4` fixture is its negative twin: the first dance turn is turn 5,
with 6 turns left, so 決めポーズ as the turn's second card gets no 集中, ending
at 1,071.

`contest-rehearsal-s55-seika-5415` is stage 1 played by another owned 清夏
memory, 5415, alone (281/780/338, 体力 30; panel 327/459/450%) with
ゲーセンの戦利品 only. One card a turn, ending at 713; 楽観的's 好調 3 on turn
1 isn't counted down that turn (大声援 takes it 3 → 6 on turn 2). Its `-2`
fixture is a second play, ending at 850, and its `-3` fixture a third, ending
at 827 with ワンモアステップ's three hits on turn 7 (172 → 448).
