# Training fidelity

`pnpm fidelity:training` replays plays captured in the game's trainings and
checks that the engine reaches every recorded state exactly.

Each fixture in `fixtures/ingame/` is one training. For each play the harness
starts from the captured initial state, fixes the turn order and multipliers
the game showed, and plays the recorded cards in order. After each card it
compares the engine's state at the next playable moment with what the game
showed. State carries over from card to card; nothing is reset to a recorded
value.

The harness builds the deck from the cards the play used, one copy for each
card played or captured in hand, and puts each in hand as its turn comes, so
draws and deck composition aren't checked, and neither are raw parameters,
NPC scores or rank thresholds. Comparing whole stages and loadouts is `pnpm fidelity`'s job.

## Fixtures

- `pItemIds`: the P-items captured in the training; their effects run as
  the recorded cards are played.
- `initial`: the state before the first turn, checked before any card is
  played. Its genki is given to the engine, as some lessons start with it.
- `turnTypes`: the turn order the game showed.
- `displayedPercents`: the multiplier the game showed for each turn type, in
  an exam. Lessons show none, so their fixtures set `replayMultipliers` to 1
  and record score as the gain over the lesson's starting attribute.
- `plays[].actions[]`: each card played, by `cardId` and `name`; `expected`,
  the state read from the screenshot after it; and `capture`, that
  screenshot's name. A card that gives an extra use leaves the turn open, so
  the next action records `turnsElapsed` where it isn't one turn per card.
- `growthBefore`: growth read from the card detail before playing it, with
  `growthCapture` naming that screenshot.
- For a card that holds another from the hand, the action records the whole
  hand (`handCardIds`), the candidates and the pick (`hold`), and the held
  pile after it (`heldCardIds`). The action where the held card comes back to
  hand records it as `returnedHeldCardId`, and the action playing that copy
  sets `useReturnedHeldCard`. Holds are checked only against a hand captured
  in full.

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

## 【基礎5】消費体力減少

A visual lesson starting at 100. Covers テレビ出演's halved costs counting down
4, 3, 2, paid with genki, stamina or both, along with concentration and good
condition. The first play clears at the cap of 140, and the other two end on
the retry screen while the last score is still counting, so the last card of
each checks only stamina, genki and concentration.

## 【基礎6】消費体力削減

A visual lesson starting at 100, with 7 stamina and 20 genki. Covers
叶えたい夢+'s cost reduction of 2 on costs paid from genki, and direct stamina
costs, which bypass genki. One play uses two copies of ありがとうの言葉, which
can be used once each. The first play clears at the cap of 140, so its final
score isn't checked.

## 【基礎7】全力

A dance lesson starting at 100. Two plays reach 10 full power charge, which
enters full power at the start of the next turn with one extra card use, and
play their last two cards in either order; in full power, scores of 15 and 9
become 45 and 27. The third play reaches only 7, stays out of full power and
gets one card in the last turn. Both full power plays clear at the cap of
160, so their final scores aren't checked.

## 【基礎8】強気

A vocal lesson starting at 100. 挨拶の基本 enters 強気 at no cost, which
doubles scores and costs (9 and 4 become 18 and 8, 2 and 3 become 4 and 6).
Costs are paid with stamina alone or split with genki, and genki is gained
after the cost is paid. Only base 強気 is captured, not 強気2. The first play
clears at the cap of 125, so its final score isn't checked.

## 【基礎9】温存

A vocal lesson starting at 100. イメージの基本 enters 温存, which cuts scores
(9, 2 and 15 become 5, 1 and 8) and costs (4 and 3 become 2), rounding as the
game does. Two plays then switch from 温存 to 強気 with 挨拶の基本, which grants
5 熱意 and an extra card use in the same turn; the third stays in 温存. 熱意
resets at the end of a turn, so the last card of each play leaves it out. Only
base 温存 is captured, not 温存2. The first play clears at the cap of 130, so
its final score isn't checked.

## 【試験研修5】全力

Two plays reach 10 full power charge and get an extra card use in the last
turn; the third reaches 7 and doesn't. Before that, 潜在能力 holds one of the
other two cards in hand: 一歩 in one play, 表現の基本 in the other. The held
card comes back to hand when full power starts, and that same copy is played
next, though the last hand of the second play has two 表現の基本. This uses
base 王者の御出まし (448), where 【基礎7】全力 used 王者の御出まし+ (449).

## 【試験研修6】強気

スターライト enters 強気 before scoring, while paying its cost in the
previous stance. From 強気, せーのっ！ enters 強気2; the extra stamina drain
starts with the next card. The plays cover costs paid with stamina and genki,
and a cost reduction of 1 applied after the stance multiplier.

The first play switches from 強気 through 温存 and back, gaining 5 熱意
and an extra use. The third reaches 温存2 first; leaving it grants 5 genki,
8 熱意 and an extra use. Its last two scores each rise by 184 at 400%.
Terminal 熱意 is omitted because the screenshot precedes its end-turn reset.

## 【応用5】プラン：アノマリー

A visual lesson starting at 100, with a target gain of 280. Covers both tiers
of preservation and strength, enthusiasm on multiple score actions, and
holding a card through full-power entry. Leaving preservation when full power
starts gives three card uses in the last turn. The first play stays below
the lesson cap through all three actions.

The second play reaches only 7 charge and keeps its card held. It also checks
the strength 2 stamina drain with half costs and a reduction of 1. The third
holds and plays アピールの基本+ instead of 一歩. Its last score reaches the
lesson cap, so only its resources are compared after the last card.
Terminal full-power stance, enthusiasm and half-cost durations are omitted
because the screenshots precede their end-turn changes.

## 【応用6】成長効果

A vocal lesson starting at 100. 総合芸術 grows when a card changes the
stance, including when 総合芸術 is outside the hand. Its detail panel shows
45 added score after three stance changes. The first play clears at the
lesson cap, so its last action checks resources and the captured growth.

The other plays use one stance change before playing 総合芸術. One enters
強気2 from 強気, and the other leaves 温存 for 強気, gaining enthusiasm
and an extra card use. Their scores remain below the cap. The last play pays
part of 総合芸術's cost with stamina. Growth gained by its own stance change applies after the
current action sequence, so that use adds 54 before the follow-up card.

## 【基礎1】好調

A dance lesson starting at 100. Covers gaining and extending good condition,
its countdown on later turns, and scores with and without its 50% bonus.
ファンサ rises from 10 to 15, アドリブ from 5 to 8, and ポーズの基本
from 2 to 3. One play pays costs with genki before stamina. The first play
clears at the cap of 140, so its last score is omitted. The other plays
finish below the cap, with terminal good-condition durations omitted.

## 【基礎2】集中

A vocal lesson starting at 100. Covers scores at concentration 0, 3 and 5,
gaining concentration after scoring, and costs paid with genki. The first
play reaches the cap of 140; the second final score is obscured during its
two-hit animation, so both final scores are omitted. The third play captures
both hits at concentration 2, with a total gain of 20 and a final attribute
of 132.

## 【基礎3】好印象

A visual lesson starting at 100. Covers good impression gained early or late,
its countdown, end-turn scoring, and scores based on its current value.
One play pays リスタート's full cost with genki and ends below the cap at
attribute 123. The first play reaches the cap of 140; the third final capture
precedes the last end-turn score, so both final scores are omitted. Terminal
good-impression durations are omitted because the screenshots precede the
next countdown.

## 【基礎4】やる気

A vocal lesson starting at 100. Covers genki gains with motivation at 0, 3,
4 and 8, costs paid with genki or stamina, and genki-based scores rounded up.
ありがとうの言葉+ adds genki before scoring; 気分転換+ spends stamina
while retaining genki. The first play reaches the cap of 140, so its final
score is omitted. The other plays end at attributes 116 and 132.

## 【試験研修1】好調

Covers scores at 200%, 250% and 400%, with and without good condition,
gaining and extending its duration, and costs paid with stamina, genki or
both. At 250%, アピールの基本 scores 23 without good condition and 35
with it; 愛嬌 scores 50 with good condition. The plays finish at scores
230, 97 and 160. Terminal good-condition durations are omitted because
the screenshots precede their end-turn countdown.

## 【試験研修2】集中

Covers concentration gained through 表情の基本, 眼力, バランス感覚,
情熱ターン and 準備運動, with costs paid from genki, stamina or both.
情熱ターン scores before gaining concentration. At 250%, its score is
28, 35 or 43 at concentration 0, 3 or 6. The final 試行錯誤 scores twice
at 400%, adding 136, 120 or 112 at concentration 9, 7 or 6. Both hits
are captured, with final scores 233, 162 and 189.

## 【応用1】プラン：センス

A visual lesson starting at 100, with a target gain of 120. Its P-item,
内なる光の耳飾り, grants 2 concentration and 1 genki at the start of a
turn with good condition, up to twice. One play triggers both uses early;
another delays condition until turn 4; the third stays without condition
and retains both uses.

楽観的 grants its concentration bonus when condition was already present
before use. 盛装の華形 scores twice with condition and once without it.
The plays also cover half costs and a cost reduction of 1. The first reaches
the cap of 220, so its last score is omitted; the others finish at attributes
136 and 150. Terminal condition and half-cost durations are omitted because
the screenshots precede their end-turn countdowns.
