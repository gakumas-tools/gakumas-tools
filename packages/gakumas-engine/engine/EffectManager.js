import { PItems, SkillCards } from "gakumas-data";
import { DEFAULT_EFFECTS, S } from "../constants";
import EngineComponent from "./EngineComponent";
import { shallowCopy } from "../utils";
import { normalizeEffect } from "../normalizeEffect";

function anyHasConditions(effects) {
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].conditions) return true;
  }
  return false;
}

export default class EffectManager extends EngineComponent {
  constructor(engine) {
    super(engine);

    // Every phase any effect has ever been registered under. setEffects is
    // the only way effects enter state, so a phase missing here can't match.
    this.registeredPhases = new Set();
  }

  initializeState(state) {
    const config = this.getConfig(state);

    state[S.effects] = [];
    state[S.effectInstanceId] = 0;
    state[S.effectCounters] = {};
    state[S.currentEffectInstanceId] = null;

    // Each entity (default-effects bundle, stage, each p-item, each card's
    // effects column) gets its own effectInstanceId so that `effectCounter`
    // patterns are scoped per-entity. Without bumping between entities,
    // they all share id=0 and any two entities with `effectCounter+=1` on
    // the same phase collide on each trigger.

    // Set default effects
    this.logger.debug("Setting default effects", DEFAULT_EFFECTS);
    this.setEffects(state, DEFAULT_EFFECTS);

    // Set stage effects
    this.logger.debug("Setting stage effects", config.stage.effects);
    this.setEffects(state, config.stage.effects, {
      type: "stage",
      primary: true,
    });
    state[S.effectInstanceId]++;

    // Set p-item effects
    let configs = [config];
    if (config.stage.type === "linkContest") {
      configs = this.engine.linkConfigs || [];
    }

    for (let c = 0; c < configs.length; c++) {
      const { pItemIds } = configs[c].idol;
      for (let i = 0; i < pItemIds.length; i++) {
        const pItem = PItems.getById(pItemIds[i]);
        this.logger.debug("Setting p-item effects", pItem.name, pItem.effects);
        this.setEffects(state, pItem.effects, {
          type: "pItem",
          id: pItemIds[i],
          primary: true,
        });
        state[S.effectInstanceId]++;
      }
    }

    // Set card effects
    this.initializeCardEffects(state);
  }

  initializeCardEffects(state) {
    for (let i = 0; i < state[S.cardMap].length; i++) {
      const skillCardId = state[S.cardMap][i].id;

      const skillCard = SkillCards.getById(skillCardId);
      const cardEffects = this.engine.cardManager.getLines(state, i, "effects");
      if (cardEffects.length) {
        this.logger.debug("Setting card effects", skillCard.name, cardEffects);
        this.setEffects(state, cardEffects, {
          type: "skillCard",
          id: skillCardId,
          idx: i,
          primary: true,
        });
        state[S.effectInstanceId]++;
      }
    }
  }

  setEffects(state, effects, source) {
    for (let i = 0; i < effects.length; i++) {
      const effect = normalizeEffect(effects[i]);
      effect.effectInstanceId = state[S.effectInstanceId];
      if (source) {
        effect.source = source;
      }
      // Effects scheduled for a single future turn (e.g. "次のターン" /
      // "Nターン後" — phase:turn + limit:1) are reservations. When they
      // fire, isDirectEffect treats them as direct so chain-triggered
      // p-items with if:isDirectEffect still match.
      if (effect.phase == "turn" && effect.limit == 1) {
        effect.type = "reservation";
      }
      this.registeredPhases.add(effect.phase);
      // Nested effects are now explicit in the AST - no more fallthrough
      state[S.effects].push(effect);
    }
  }

  clearPrestageEffects(state) {
    state[S.effects] = state[S.effects].filter(
      (effect) => effect.phase != "prestage",
    );
  }

  clearExpiredEffects(state) {
    state[S.effects] = state[S.effects].map((effect) => {
      if (effect.limit != null && effect.limit < 1) return {};
      if (effect.ttl != null && effect.ttl < 0) return {};
      return effect;
    });
  }

  triggerEffectsForPhase(
    state,
    phase,
    conditionState,
    registeredBefore = state[S.effects].length,
  ) {
    if (!this.registeredPhases.has(phase)) return;

    // Fast path: no active effect matches this phase — skip the phase
    // save/restore dance and the effectsByGroup allocation entirely.
    const effectList = state[S.effects];
    let anyMatch = false;
    for (let i = 0; i < registeredBefore; i++) {
      if (effectList[i].phase === phase) {
        anyMatch = true;
        break;
      }
    }
    if (!anyMatch) return;

    // Restore both on exit: a nested trigger of another phase overwrites
    // parentPhase, so it can't be relied on to hold this call's outer phase.
    const outerPhase = state[S.phase];
    const outerParentPhase = state[S.parentPhase];
    state[S.parentPhase] = outerPhase;
    state[S.phase] = phase;

    // Pair each matched effect ref with its index via parallel arrays so
    // refs go straight to triggerEffects without a per-match spread.
    let matched = null;
    let matchedIndices = null;
    let grouped = false;
    for (let i = 0; i < registeredBefore; i++) {
      const effect = effectList[i];
      if (effect.phase !== phase) continue;
      // Phase target filter: at:phase[rule] — fires only when the source
      // card (state.usedCard) matches the target rule.
      if (effect.filter) {
        const sourceCard = state[S.usedCard];
        if (sourceCard == null) continue;
        const matching = this.engine.cardManager.getTargetRuleCards(
          state,
          effect.filter,
          null,
        );
        if (!matching.has(sourceCard)) continue;
      }
      if (!matched) {
        matched = [];
        matchedIndices = [];
      }
      matched.push(effect);
      matchedIndices.push(i);
      if (effect.group) grouped = true;
    }

    if (matched) {
      this.logger.debug(phase, matched);
      if (!grouped) {
        this.triggerPhaseGroup(
          state,
          effectList,
          matched,
          matchedIndices,
          conditionState,
        );
      } else {
        // Groups trigger in for..in order of their keys.
        const effectsByGroup = {};
        const indicesByGroup = {};
        for (let m = 0; m < matched.length; m++) {
          const group = matched[m].group || 0;
          if (!effectsByGroup[group]) {
            effectsByGroup[group] = [];
            indicesByGroup[group] = [];
          }
          effectsByGroup[group].push(matched[m]);
          indicesByGroup[group].push(matchedIndices[m]);
        }
        for (const gKey in effectsByGroup) {
          this.triggerPhaseGroup(
            state,
            effectList,
            effectsByGroup[gKey],
            indicesByGroup[gKey],
            conditionState,
          );
        }
      }
    }

    state[S.phase] = outerPhase;
    state[S.parentPhase] = outerParentPhase;
  }

  triggerPhaseGroup(state, effectList, effects, indices, conditionState) {
    const triggered = this.triggerEffects(
      state,
      effects,
      conditionState,
      null,
      false,
      indices,
    );
    for (let j = 0; j < triggered.length; j++) {
      const idx = triggered[j];
      const eff = effectList[idx];
      if (eff.limit) {
        // Effects are shared across state copies; replace, don't mutate.
        effectList[idx] = { ...eff, limit: eff.limit - 1 };
      }
    }
  }

  triggerEffects(state, effects, cndState, card, skipConditions, indices) {
    // A private condition snapshot is only needed if a condition is checked.
    let conditionState = cndState;
    if (!conditionState && !skipConditions && anyHasConditions(effects)) {
      conditionState = shallowCopy(state);
    }

    // Condition checks see pre-modification counters (copy-on-write).
    if (conditionState) {
      conditionState[S.effectCounters] = state[S.effectCounters];
    }

    let triggeredEffects = [];

    this.logger.debug(effects);

    // When `indices` is provided (callers: triggerEffectsForPhase, which
    // has already matched `effect.phase === phase`), we execute the
    // effects now and skip the "re-register as delayed" branch. That lets
    // the caller pass effect refs directly instead of spread copies.
    const fromPhase = indices !== undefined && indices !== null;

    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];

      // Delayed effects (nested phase blocks)
      if (!fromPhase && effect.phase) {
        this.logger.debug("Setting delayed effect", effect);
        this.setEffects(
          state,
          [effect],
          card != null
            ? {
                type: "skillCardEffect",
                id: state[S.cardMap][card].id,
                idx: card,
              }
            : null,
        );
        this.logger.log(state, "setEffect");
        continue;
      }

      // Check limit
      if (effect.limit != null && effect.limit < 1) {
        this.logger.debug("Effect limit reached", effect.limit);
        continue;
      }

      // Check ttl
      if (effect.ttl != null && effect.ttl < 0) {
        this.logger.debug("Effect ttl reached", effect.ttl);
        continue;
      }

      // Check delay
      if (effect.delay != null && effect.delay >= 0) {
        this.logger.debug("Effect delay", effect.delay);
        continue;
      }

      // Set current effect instance ID for counter resolution
      const prevInstanceId = state[S.currentEffectInstanceId];
      state[S.currentEffectInstanceId] = effect.effectInstanceId;
      if (conditionState) {
        conditionState[S.currentEffectInstanceId] = effect.effectInstanceId;
      }

      // Check conditions (AST nodes with proper AND support)
      if (!skipConditions && effect.conditions) {
        let satisfied = true;
        for (let j = 0; j < effect.conditions.length; j++) {
          const condition = effect.conditions[j];
          if (
            !this.engine.evaluator.evaluateCondition(conditionState, condition)
          ) {
            satisfied = false;
            break;
          }
        }
        if (!satisfied) {
          state[S.currentEffectInstanceId] = prevInstanceId;
          continue;
        }
      }

      // Log source
      if (effect.source) {
        this.logger.log(state, "entityStart", effect.source);
      }

      this.logger.debug("Executing actions", effect.actions);

      // Track the effect being triggered so isDirectEffect can see whether
      // this run is a reservation firing (e.g. card-scheduled "next turn"
      // effects should propagate as direct).
      const prevTriggeredEffect = state[S.triggeredEffect];
      state[S.triggeredEffect] = effect;

      // Apply growth or actions or effects
      if (effect.targets) {
        // Identify cards to grow
        let growthCards = new Set();
        for (let j = 0; j < effect.targets.length; j++) {
          const targetRuleCards = this.engine.cardManager.getTargetRuleCards(
            state,
            effect.targets[j],
            effect.source,
          );
          for (let card of targetRuleCards) {
            growthCards.add(card);
          }
        }

        // Grow cards
        this.engine.cardManager.grow(state, [...growthCards], effect.actions);
      } else {
        // Execute actions
        if (effect.actions) {
          this.engine.executor.executeActions(state, effect.actions, card);
        }
      }

      // Delayed effects from p-items
      if (effect.effects) {
        this.logger.debug("Setting effects", effect.effects);
        // Inherit the parent's group so registered nested effects trigger
        // in the correct order relative to sibling-grouped effects. Legacy
        // annotates each effect with an explicit group in the CSV; our
        // structured DSL puts group on the outer block, so we propagate
        // it here for grouping parity.
        const toSet =
          effect.group != null
            ? effect.effects.map((e) =>
                e.group != null ? e : { ...e, group: effect.group },
              )
            : effect.effects;
        // Sub-effects inherit the entity source (so their score still folds
        // under the registering p-item/card) but not the `primary` marker —
        // these are registered at runtime and shouldn't count as fresh
        // activations for stats purposes.
        let inheritedSource = effect.source;
        if (inheritedSource?.primary) {
          const { primary, ...rest } = inheritedSource;
          inheritedSource = rest;
        }
        // Card actions reach here when a phase block is nested inside a
        // conditional wrapper; mirror the top-level delayed-effect branch
        // so card-scheduled reservations still count as direct effects
        // when they fire.
        if (!inheritedSource && card != null) {
          inheritedSource = {
            type: "skillCardEffect",
            id: state[S.cardMap][card].id,
            idx: card,
          };
        }
        this.setEffects(state, toSet, inheritedSource);
        this.logger.log(state, "setEffect");
      }

      state[S.triggeredEffect] = prevTriggeredEffect;

      // Log source end
      if (effect.source) {
        this.logger.log(state, "entityEnd", effect.source);
      }

      // Restore previous effect instance ID
      state[S.currentEffectInstanceId] = prevInstanceId;

      // Track triggered effects — if called with indices, the caller's
      // parallel indices array tells us the effect's position in
      // state[S.effects]; otherwise fall back to effect.index set by
      // legacy spread callers.
      triggeredEffects.push(fromPhase ? indices[i] : effect.index);
    }

    return triggeredEffects;
  }

  decrementTtl(state) {
    const effects = state[S.effects];
    for (let i = 0; i < effects.length; i++) {
      const eff = effects[i];
      if (eff.ttl == null || eff.ttl == -1) continue;
      effects[i] = { ...eff, ttl: eff.ttl - 1 };
    }
  }

  decrementDelay(state) {
    const effects = state[S.effects];
    for (let i = 0; i < effects.length; i++) {
      const eff = effects[i];
      if (eff.delay == null || eff.delay == -1) continue;
      effects[i] = { ...eff, delay: eff.delay - 1 };
    }
  }
}
