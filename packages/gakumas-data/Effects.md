# Gakumas Data Effects DSL

Effects on p-items, skill cards, stages, p-drinks, and customizations are
expressed in a structured, block-scoped DSL that is parsed into an AST, then
transformed into the engine's runtime effect format.

## At a glance

```
at:startOfTurn {
  if:goodConditionTurns>=4 {
    concentration+=4
    goodConditionTurns+=4
  }
  limit:1
}

at:activeCardUsed { score+=goodImpressionTurns }
```

Effects are separated by whitespace or `;`. Braces group; colons introduce
simple keywords (`at:`, `if:`, `target:`, `do:`, `limit:`, …). Bare
assignments like `score+=5` are actions without a leading `do:`.

## Effect structure

An effect consists of a **phase**, optional **filter**, optional nested
**conditions** and **targets**, and one or more **actions**, plus optional
**modifiers** (`limit`, `ttl`, `delay`, `group`, `line`).

```
at:<phase>[<filter>]? {
  if:<condition> {
    target:<targetExpr> {
      <action>
      <action>
    }
  }
  limit:<n>
  ttl:<n>
  delay:<n>
  group:<n>
}
```

Any level may be omitted. All four are optional, but an effect without
actions only makes sense if it registers nested phase effects (see below).

## Phases

Phases declare _when_ an effect fires. Marked with `at:`.

```
at:startOfTurn { genki+=2 }
```

| Phase (JP)                               | DSL                            |
| ---------------------------------------- | ------------------------------ |
| ステージ開始時                           | `startOfStage`                 |
| ステージ開始後                           | `afterStartOfStage`            |
| 事前発動                                 | `prestage`                     |
| ターン開始前                             | `beforeStartOfTurn`            |
| ターン開始時                             | `startOfTurn`                  |
| ターン開始後                             | `afterStartOfTurn`             |
| 次のターン / 〇ターン後                  | `turn`                         |
| 〇ターンごとに                           | `everyTurn`                    |
| ターン終了時                             | `endOfTurn`                    |
| ターンスキップ時                         | `turnSkipped`                  |
| スキルカード使用時                       | `cardUsed`                     |
| アクティブスキルカード使用時             | `activeCardUsed`               |
| メンタルスキルカード使用時               | `mentalCardUsed`               |
| スキルカード使用後                       | `afterCardUsed`                |
| アクティブスキルカード使用後             | `afterActiveCardUsed`          |
| メンタルスキルカード使用後               | `afterMentalCardUsed`          |
| スキルカード処理中                       | `processCard`                  |
| 消費処理中                               | `processCost`                  |
| コスト計算                               | `checkCost`                    |
| スキルカードを手札に移動後               | `cardMovedToHand`              |
| スキルカードを保留に移動後               | `cardMovedToHeld`              |
| スキルカードが除外された時               | `cardRemoved`                  |
| スキルカードコストで強化状態を消費した時 | `buffCostConsumed`             |
| 指針が変更した時                         | `stanceChanged`                |
| 指針の値が変更した時（段階上昇を含む）   | `stanceValueChanged`           |
| 体力が減少後                             | `staminaDecreased`             |
| 元気が増加後                             | `genkiIncreased`               |
| 好調の効果ターンが増加後                 | `goodConditionTurnsIncreased`  |
| 集中が増加後                             | `concentrationIncreased`       |
| 好印象の効果ターンが増加後               | `goodImpressionTurnsIncreased` |
| やる気が増加後                           | `motivationIncreased`          |
| 全力値が増加後                           | `fullPowerChargeIncreased`     |

### Phase filters

A phase may carry a target-rule filter in brackets. The effect fires only
when the phase's source card matches the rule.

```
at:cardUsed[active] { score+=5 }
at:afterCardUsed[mental & !removed] { ... }
```

For the `cardUsed`/`afterCardUsed` phases, the simple filters `[active]` and
`[mental]` are shortcuts for `activeCardUsed`/`afterActiveCardUsed` and
`mentalCardUsed`/`afterMentalCardUsed`.

## Conditions

Conditions gate an effect. Marked with `if:`. Support comparison operators,
boolean `&` / `|`, negation `!`, and parentheses.

```
if:goodConditionTurns>=4 { concentration+=4 }
if:isFullPower & turnsRemaining<=3 { score+=50 }
if:!isStrength { setStance(strength) }
if:(stamina>=10 | goodImpressionTurns>=5) { drawCard }
```

Condition expressions may reference any state field, any **variable
resolver** (see reference), or string literals like stance names (`strength`,
`fullPower`), rarities (`SSR`), etc.

`countCards[targetExpr]` counts cards matching a target rule:

```
if:countCards[hand]>=3 { score+=10 }
if:countCards[!removed & T]>=2 { drawCard(2) }
```

## Actions

State changes that execute when the effect fires. Written as bare
assignments, or prefixed with `do:`, or inside `do { ... }` blocks.

```
score+=5
goodImpressionTurns+=3
concentration*=2
setStance(fullPower)
drawCard(2)
```

Assignment operators: `=`, `+=`, `-=`, `*=`, `/=`, `%=`.

`floor(expression)` rounds a value down before score modifiers are applied,
for example `score+=floor(cumulativeFullPowerCharge*0.6)`.

### Special actions (non-assignment)

| Action                                    | DSL                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| スキルカードを引く                        | `drawCard` or `drawCard(n)`                                              |
| 手札をすべてレッスン中強化                | `upgradeHand`                                                            |
| 手札をすべて入れ替える                    | `exchangeHand`                                                           |
| ランダムな手札1枚を強化                   | `upgradeRandomCardInHand`                                                |
| ランダムな強化済みスキルカード生成        | `addRandomUpgradedCardToHand`                                            |
| 〃 (SSR限定)                              | `addRandomUpgradedSSRCardToHand`                                         |
| スキルカードを山札/手札/デッキに追加      | `addCardToDeck(id)` / `addCardToHand(id)` / `addCardToTopOfDeck(id)`     |
| 特定カードを手札に移動 (ランダム)         | `moveRandomToHand[targetExpr](, num)`                                    |
| 特定カードを手札に移動 (選択)             | `moveSelectedToHand[targetExpr](, num)`                                  |
| 特定カードを手札に移動 (全部)             | `moveAllToHand[targetExpr]`                                              |
| 特定カードを山札上に移動 (ランダム)       | `moveRandomToTopOfDeck[...](, num)`                                      |
| 特定カードを山札上に移動 (選択)           | `moveSelectedToTopOfDeck[...](, num)`                                    |
| 特定カードを山札上に移動 (全部)           | `moveAllToTopOfDeck[...]`                                                |
| 特定カードを山札に戻す                    | `moveAllToDeck[...]`                                                     |
| 特定カードを保留 (ランダム)               | `holdRandom[...](, num)`                                                 |
| 特定カードを保留 (全部)                   | `holdAll[...]`                                                           |
| このカードを保留                          | `holdThis`                                                               |
| 特定カードを無料で使用 (ランダム/全/選択) | `useRandomFree[...]` / `useAllFree[...]` / `useSelectedFree[...](, num)` |
| 特定カードを除外 (ランダム)               | `removeRandom[...]`                                                      |
| 保留カードを手札に移動                    | `moveHeldCardsToHand`                                                    |
| 低下状態を解除                            | `removeDebuffs(n)`                                                       |
| 指針を変更                                | `setStance(stance)`                                                      |
| 全力値を減少                              | `decreaseFullPowerCharge(n)`                                             |
| スコア上昇量増加                          | `setScoreBuff(amount, turns?)`                                           |
| スコア低下                                | `setScoreDebuff(amount, turns?)`                                         |
| 好印象増加量増加                          | `setGoodImpressionTurnsBuff(amount, turns?)`                             |
| 好印象効果増加                            | `setGoodImpressionTurnsEffectBuff(amount, turns?)`                       |
| 好印象効果回数増加                        | `setGoodImpressionTurnsTimesBuff(amount, turns?)`                        |
| やる気増加量増加                          | `setMotivationBuff(amount, turns?)`                                      |
| 好調増加量増加                            | `setGoodConditionTurnsBuff(amount, turns?)`                              |
| 好調増加量追加                            | `setGoodConditionTurnsAdditionBuff(amount, turns?)`                      |
| 集中増加量増加                            | `setConcentrationBuff(amount, turns?)`                                   |
| 集中強化                                  | `setConcentrationEffectBuff(amount, turns?)`                             |
| 熱気増加量増加                            | `setEnthusiasmBuff(amount, turns?)`                                      |
| 熱気ボーナス                              | `setEnthusiasmBonus(amount, turns?)`                                     |
| 全力値増加量増加                          | `setFullPowerChargeBuff(amount, turns?)`                                 |
| 全力強化                                 | `setFullPowerEffectBuff(amount, turns?)`                                 |
| 強気強化                                 | `setStrengthEffectBuff(amount, turns?)`                                  |

## Target rules

Target expressions select a set of cards. They appear:

- After `target:` — for growth / card-manipulation effects.
- Inside `[...]` — as a filter on functions like `countCards[hand]` and
  `at:phase[...]`, and as the argument to actions like `moveRandomToHand[...]`.

### Boolean composition

Target expressions support `&` (intersection), `|` (union), `!` (complement).

```
target:active & !removed { g.score+=5 }
if:countCards[hand | held] >= 3 { drawCard }
```

### Target identifiers

| Meaning                  | Identifier                           |
| ------------------------ | ------------------------------------ |
| このカード               | `this`                               |
| 手札                     | `hand`                               |
| 山札                     | `deck`                               |
| 捨て札                   | `discarded`                          |
| 保留                     | `held`                               |
| 除外                     | `removed`                            |
| すべて                   | `all`                                |
| アクティブカード         | `active`                             |
| メンタルカード           | `mental`                             |
| トラブルカード           | `trouble`                            |
| 基本カード               | `basic`                              |
| プロデュースアイドル由来 | `pIdol`                              |
| レアリティ               | `T` / `N` / `R` / `SR` / `SSR` / `L` |

### Target functions

| Function       | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| `effect(name)` | カードが特定の効果（例: `score`, `strength`）を持つ  |
| `id(n)`        | ID が `n` のカード（強化前／後を区別）               |

Example — move cards with ID 383 currently in deck or discards to hand:

```
moveRandomToHand[id(383) & (deck | discarded)]
```

## Modifiers

Modifiers attach to the effect they appear in.

| Modifier  | Meaning                                |
| --------- | -------------------------------------- |
| `limit:N` | Maximum activations per stage          |
| `ttl:N`   | Time-to-live in turns                  |
| `delay:N` | Turns to delay before firing           |
| `group:N` | Firing order (lower fires earlier)     |
| `line:N`  | Line number metadata (used by tooling) |
| `level:N` | Customization patch level (see below)  |

## Growth effects

Skill card / customization `effects` columns register effects at stage start
(the entity's persistent triggered behavior). The `actions` column holds the
immediate actions fired when the card is played.

Growth fields (`g.*`) are set via `target:` blocks. They persist on the
card across plays.

```
at:prestage {
  target:this { g.score+=6 }
}

target:active { g.score+=16; g.cost-=1 }
```

| Growth field   | DSL                            |
| -------------- | ------------------------------ |
| スコア         | `g.score`                      |
| スコア上昇回数 | `g.scoreTimes`                 |
| コスト         | `g.cost`                       |
| 固定型コスト   | `g.typedCost`                  |
| 元気           | `g.genki`                      |
| 好調           | `g.goodConditionTurns`         |
| 絶好調         | `g.perfectConditionTurns`      |
| 集中           | `g.concentration`              |
| 好印象         | `g.goodImpressionTurns`        |
| やる気         | `g.motivation`                 |
| 全力値         | `g.fullPowerCharge`            |
| 消費軽減       | `g.halfCostTurns`              |
| 好印象分スコア | `g.scoreByGoodImpressionTurns` |
| やる気分スコア | `g.scoreByMotivation`          |
| 元気分スコア   | `g.scoreByGenki`               |
| 指針段階       | `g.stanceLevel`                |

## Anchors and customization patches

**Anchors** (`@name`) label an effect or a single action so customizations
can target it.

### Top-level anchor

```
@foo if:X { score+=5; genki+=5 }
```

A customization may patch the whole anchored effect:

```
@foo limit:2
```

### Sub-expression anchor

Anchors may also attach to a single action inside an effect body, so a
customization can patch just that line:

```
if:X { @score score+=5; genki+=5 }
```

Customization:

```
@score score+=10
```

Only the `score+=5` action is replaced; `genki+=5` is unchanged.

### Customization patch sequences

Customization columns use a patch sequence grammar. Each patch is either:

- `+ <effect>` — append a new effect to the card's attribute list.
- `@name <partial>` — replace fields on the effect labeled `@name`.
  The partial specifies only the fields being patched (phase, actions,
  conditions, limit, ttl, delay, group, filter, etc.); other fields remain.

Patch-level `level:N` indicates at which customization level the patch
applies. Use the block form — it scopes each level's contribution into one
labeled block, matching the "only one level fires at a time" runtime
semantics. The trailing-modifier form (`@foo score+=10; level:1`) parses to
the same AST but is rejected by `pnpm validate:data`.

```
level:1 { @foo score+=10 }
level:2 { @foo score+=15 }
```

Example — a customization that adds a limit at level 1, and rewrites the
effect entirely at level 2:

```
level:1 { @foo limit:2 }
level:2 { @foo at:startOfTurn { score+=20; limit:2 } }
```

## Reference: state variables

These names are legal as identifiers in conditions and expression RHS.
They are also valid as assignment LHS unless marked read-only.

| Variable                       | DSL                            |
| ------------------------------ | ------------------------------ |
| 経過ターン数                   | `turnsElapsed`                 |
| 残りターン数                   | `turnsRemaining`               |
| スキルカード使用回数           | `cardUsesRemaining`            |
| 最大体力                       | `maxStamina` (read-only)       |
| 固定体力                       | `fixedStamina`                 |
| 体力                           | `stamina`                      |
| ステージ中に消費した体力       | `consumedStamina`              |
| 固定元気                       | `fixedGenki`                   |
| 元気                           | `genki`                        |
| 体力 (元気適用)                | `cost`                         |
| スコア                         | `score`                        |
| スコア上昇回数                 | `scoreTimes`                   |
| ステージ中使用したカード数     | `cardsUsed`                    |
| ステージ中使用したアクティブ数 | `activeCardsUsed`              |
| ターン内使用カード数           | `turnCardsUsed`                |
| ターン内強化カード数           | `turnCardsUpgraded`            |
| 好調                           | `goodConditionTurns`           |
| 絶好調                         | `perfectConditionTurns`        |
| 集中                           | `concentration`                |
| 好印象                         | `goodImpressionTurns`          |
| ステージ中に消費した好印象     | `consumedGoodImpressionTurns`  |
| やる気                         | `motivation`                   |
| 誇り                           | `prideTurns`                   |
| 指針                           | `stance`                       |
| 前の指針                       | `prevStance`                   |
| 指針固定                       | `lockStanceTurns`              |
| 全力値                         | `fullPowerCharge`              |
| 累計全力値                     | `cumulativeFullPowerCharge`    |
| 熱気                           | `enthusiasm`                   |
| 熱意延長                       | `enthusiasmExtensionTurns`     |
| 強気回数                       | `strengthTimes`                |
| 温存回数                       | `preservationTimes`            |
| のんびり回数                   | `leisureTimes`                 |
| 全力回数                       | `fullPowerTimes`               |
| 消費体力減少                   | `halfCostTurns`                |
| 消費体力増加                   | `doubleCostTurns`              |
| 強化状態コスト増加             | `doubleBuffCostTurns`          |
| 消費体力削減                   | `costReduction`                |
| 消費体力追加                   | `costIncrease`                 |
| スキルカード追加発動           | `doubleCardEffectCards`        |
| コスト0化                      | `nullifyCostCards`             |
| アクティブコスト0化            | `nullifyCostActiveCards`       |
| 元気無効                       | `nullifyGenkiTurns`            |
| 低下状態無効                   | `nullifyDebuff`                |
| アクティブ使用不可             | `noActiveTurns`                |
| メンタル使用不可               | `noMentalTurns`                |
| カード使用不可                 | `noCardUseTurns`               |
| 不調                           | `poorConditionTurns`           |
| 不安                           | `uneaseTurns`                  |
| 集中適用倍数                   | `concentrationMultiplier`      |
| 熱気適用倍数                   | `enthusiasmMultiplier`         |
| やる気適用倍数                 | `motivationMultiplier`         |
| 好調効果適用倍数               | `goodConditionTurnsMultiplier` |
| 親フェーズ                     | `parentPhase`                  |
| 好印象の増加量                 | `goodImpressionTurnsDelta`     |
| やる気の増加量                 | `motivationDelta`              |
| 元気の増加量                   | `genkiDelta`                   |
| 好調の増加量                   | `goodConditionTurnsDelta`      |
| 集中の増加量                   | `concentrationDelta`           |
| 体力減少量                     | `staminaDelta`                 |

## Reference: variable resolvers

Function-like names resolvable in conditions/expressions.

| Meaning                          | DSL                                     |
| -------------------------------- | --------------------------------------- |
| ボーカルターン                   | `isVocalTurn`                           |
| ダンスターン                     | `isDanceTurn`                           |
| ビジュアルターン                 | `isVisualTurn`                          |
| 強気中                           | `isStrength`                            |
| 温存/のんびり中                  | `isPreservation`                        |
| 全力中                           | `isFullPower`                           |
| 直接発動か                       | `isDirectEffect`                        |
| 指針変更回数                     | `stanceChangedTimes`                    |
| 好印象効果倍率                   | `goodImpressionTurnsEffectBuff`         |
| 使用カード ID                    | `usedCardId`                            |
| 使用カードベース ID              | `usedCardBaseId`                        |
| 前使用カード種類                 | `lastUsedCardType`                      |
| 移動カード ID                    | `movedCardId`                           |
| カードが効果を持つか             | `cardHasEffect(effectName)`             |
| カードの入手元                   | `cardSourceType`                        |
| カードのレアリティ               | `cardRarity`                            |
| 指定ターゲットに一致するカード数 | `countCards[targetExpr]`                |
| エフェクトカウンター             | `effectCounter` / `effectCounter(name)` |

## File columns

Each data file's DSL columns:

| File                 | Column       | Kind                                  |
| -------------------- | ------------ | ------------------------------------- |
| `skill_cards.csv`    | `conditions` | effect sequence — usability gate      |
| `skill_cards.csv`    | `cost`       | effect sequence — cost actions        |
| `skill_cards.csv`    | `actions`    | effect sequence — played-card actions |
| `skill_cards.csv`    | `effects`    | effect sequence — triggered effects   |
| `customizations.csv` | `conditions` | patch sequence                        |
| `customizations.csv` | `cost`       | patch sequence                        |
| `customizations.csv` | `actions`    | patch sequence                        |
| `customizations.csv` | `effects`    | patch sequence                        |
| `p_items.csv`        | `effects`    | effect sequence — stage triggers      |
| `stages.csv`         | `effects`    | effect sequence — stage triggers      |
| `p_drinks.csv`       | `actions`    | effect sequence — immediate actions   |

## Validation

Every DSL field across all data files is validated at build time against
this reference. Run:

```
pnpm validate:data
```

Unknown phases, variables, actions, or target identifiers will fail the
build with a specific error.
