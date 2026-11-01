import {
  DEBUFF_FIELDS,
  EOT_DECREMENT_FIELDS,
  S,
  STANCE_CHANGED_EFFECTS,
} from "../constants";
import EngineComponent from "./EngineComponent";

const BUFF_TYPES = [
  { action: "setScoreBuff", field: S.scoreBuffs },
  { action: "setScoreDebuff", field: S.scoreDebuffs },
  { action: "setGoodImpressionTurnsBuff", field: S.goodImpressionTurnsBuffs },
  {
    action: "setGoodImpressionTurnsEffectBuff",
    field: S.goodImpressionTurnsEffectBuffs,
  },
  {
    action: "setGoodImpressionTurnsTimesBuff",
    field: S.goodImpressionTurnsTimesBuffs,
  },
  { action: "setMotivationBuff", field: S.motivationBuffs },
  { action: "setMotivationAdditionBuff", field: S.motivationAdditionBuffs },
  { action: "setGoodConditionTurnsBuff", field: S.goodConditionTurnsBuffs },
  {
    action: "setGoodConditionTurnsAdditionBuff",
    field: S.goodConditionTurnsAdditionBuffs,
  },
  { action: "setConcentrationBuff", field: S.concentrationBuffs },
  { action: "setConcentrationAdditionBuff", field: S.concentrationAdditionBuffs },
  { action: "setConcentrationEffectBuff", field: S.concentrationEffectBuffs },
  { action: "setEnthusiasmBuff", field: S.enthusiasmBuffs },
  { action: "setEnthusiasmBonus", field: S.enthusiasmBonusBuffs },
  { action: "setFullPowerChargeBuff", field: S.fullPowerChargeBuffs },
  { action: "setFullPowerEffectBuff", field: S.fullPowerEffectBuffs },
  { action: "setStrengthEffectBuff", field: S.strengthEffectBuffs },
];

export default class BuffManager extends EngineComponent {
  constructor(engine) {
    super(engine);

    this.variableResolvers = {
      isPreservation: (state) =>
        state[S.stance].startsWith("pre") || state[S.stance] === "leisure",
      isStrength: (state) => state[S.stance].startsWith("str"),
      isFullPower: (state) => state[S.stance] === "fullPower",
      isDirectEffect: (state) =>
        state[S.parentPhase] === "processCard" ||
        state[S.parentPhase] === "processCost" ||
        state[S.parentPhase] === "cardMovedToHand" ||
        state[S.parentPhase] === "cardMovedToHeld" ||
        (state[S.triggeredEffect]?.type === "reservation" &&
          state[S.triggeredEffect]?.source?.type === "skillCardEffect") ||
        (state[S.phase] == "stanceChanged" &&
          state[S.prevStance] != "fullPower" &&
          state[S.stance] == "fullPower"),
      stanceChangedTimes: (state) =>
        state[S.strengthTimes] +
        state[S.preservationTimes] +
        state[S.fullPowerTimes],
      goodImpressionTurnsEffectBuff: (state) =>
        state[S.goodImpressionTurnsEffectBuffs].reduce(
          (acc, buff) => acc + buff.amount,
          1,
        ),
    };

    this.specialActions = {
      removeDebuffs: (state, amount) =>
        this.removeDebuffs(state, parseInt(amount, 10)),
      setStance: (state, stance) => this.setStance(state, stance),
      decreaseFullPowerCharge: (state, amount) => {
        state[S.fullPowerCharge] = Math.max(
          0,
          state[S.fullPowerCharge] - parseInt(amount, 10),
        );
      },
    };

    // Generate buff methods and special actions
    for (const { action, field } of BUFF_TYPES) {
      this[action] = (state, amount, turns) =>
        this.setBuff(state, field, amount, turns, action);
      this.specialActions[action] = (state, amount, turns) =>
        this[action](
          state,
          parseFloat(amount),
          turns ? parseInt(turns, 10) : null,
        );
    }
  }

  initializeState(state) {
    // General
    state[S.halfCostTurns] = 0;
    state[S.doubleCostTurns] = 0;
    state[S.doubleBuffCostTurns] = 0;
    state[S.costReduction] = 0;
    state[S.costIncrease] = 0;
    state[S.nullifyCostCards] = 0;
    state[S.nullifyCostActiveCards] = 0;
    state[S.nullifyDebuff] = 0;
    state[S.nullifyGenkiTurns] = 0;
    state[S.doubleCardEffectCards] = 0;
    state[S.noActiveTurns] = 0;
    state[S.noMentalTurns] = 0;
    state[S.noCardUseTurns] = 0;
    state[S.poorConditionTurns] = 0;
    state[S.uneaseTurns] = 0;

    // Buffs
    state[S.scoreBuffs] = [];
    state[S.scoreDebuffs] = [];
    state[S.goodImpressionTurnsBuffs] = [];
    state[S.goodImpressionTurnsEffectBuffs] = [];
    state[S.goodImpressionTurnsTimesBuffs] = [];
    state[S.motivationBuffs] = [];
    state[S.motivationAdditionBuffs] = [];
    state[S.goodConditionTurnsBuffs] = [];
    state[S.goodConditionTurnsAdditionBuffs] = [];
    state[S.concentrationBuffs] = [];
    state[S.concentrationAdditionBuffs] = [];
    state[S.concentrationEffectBuffs] = [];
    state[S.enthusiasmBuffs] = [];
    state[S.enthusiasmBonusBuffs] = [];
    state[S.fullPowerChargeBuffs] = [];
    state[S.fullPowerEffectBuffs] = [];
    state[S.strengthEffectBuffs] = [];

    // Sense
    state[S.goodConditionTurns] = 0;
    state[S.perfectConditionTurns] = 0;
    state[S.concentration] = 0;

    // Logic
    state[S.goodImpressionTurns] = 0;
    state[S.motivation] = 0;
    state[S.prideTurns] = 0;

    // Anomaly
    state[S.stance] = "none";
    state[S.lockStanceTurns] = 0;
    state[S.fullPowerCharge] = 0;
    state[S.cumulativeFullPowerCharge] = 0;
    state[S.enthusiasm] = 0;
    state[S.enthusiasmExtensionTurns] = 0;
    state[S.strengthTimes] = 0;
    state[S.preservationTimes] = 0;
    state[S.fullPowerTimes] = 0;
    state[S.leisureTimes] = 0;
    state[S.stanceChangedByDirectEffectTimes] = 0;

    // Bitmask over EOT_DECREMENT_FIELDS: buffs/debuffs protected from decrement
    state[S.freshBuffs] = 0;

    // Deltas
    state[S.goodImpressionTurnsDelta] = 0;
    state[S.motivationDelta] = 0;
    state[S.genkiDelta] = 0;
    state[S.goodConditionTurnsDelta] = 0;
    state[S.concentrationDelta] = 0;
    state[S.staminaDelta] = 0;

    // Other
    state[S.nullifySelect] = 0;
    state[S.freeCardUses] = 0;
    state[S.paidCardUses] = 0;
    state[S.scoreTimes] = 0;
    state[S.buffCostConsumed] = false;
  }

  setBuff(state, field, amount, turns, logLabel) {
    // Buff lists are copy-on-write.
    const arr = state[field].slice();
    state[field] = arr;
    // Merge only into an entry that will expire at the same time: a buff
    // gained now is protected from this turn's decrement (fresh), so it
    // can't share an entry with an older one that isn't. Buffs without a
    // duration never decrement, so freshness doesn't matter for them.
    const fresh = !state[S.unfreshPhase];
    const buffIndex = arr.findIndex(
      (b) => b.turns == turns && (turns == null || b.fresh == fresh),
    );
    if (buffIndex != -1) {
      const old = arr[buffIndex];
      arr[buffIndex] = { ...old, amount: old.amount + amount };
    } else {
      arr.push({
        amount,
        turns,
        fresh,
      });
    }
    this.logger.log(state, logLabel, {
      amount,
      turns,
    });
  }

  removeDebuffs(state, amount) {
    for (let i = 0; i < DEBUFF_FIELDS.length; i++) {
      const field = DEBUFF_FIELDS[i];
      if (state[field] > 0) {
        state[field] = 0;
        amount--;
        if (amount <= 0) {
          break;
        }
      }
    }
  }

  decrementBuffTurns(state) {
    // General buffs
    for (let i = 0; i < EOT_DECREMENT_FIELDS.length; i++) {
      const field = EOT_DECREMENT_FIELDS[i];
      const bit = 1 << i;
      if (state[S.freshBuffs] & bit) {
        state[S.freshBuffs] &= ~bit;
      } else if (state[field]) {
        state[field]--;
      }
    }

    for (const { field } of BUFF_TYPES) {
      const buffs = state[field];
      if (!buffs.length) continue;
      const next = [];
      for (let i = 0; i < buffs.length; i++) {
        const b = buffs[i];
        let nb;
        if (b.fresh) nb = { ...b, fresh: false };
        else if (b.turns) nb = { ...b, turns: b.turns - 1 };
        else nb = b;
        if (nb.turns != 0) next.push(nb);
      }
      state[field] = next;
    }
  }

  setStance(state, stance) {
    // Stance locked
    if (state[S.stance] == "fullPower") {
      if (stance != "none") return;
    } else if (state[S.lockStanceTurns]) return;

    if (state[S.stance] == "leisure" && stance.startsWith("preservation"))
      return;

    state[S.prevStance] = state[S.stance];

    if (stance.startsWith("preservation")) {
      if (state[S.stance].startsWith("preservation")) {
        state[S.stance] = "preservation2";
      } else {
        state[S.stance] = stance;
      }
    } else if (stance.startsWith("strength")) {
      if (state[S.stance].startsWith("strength")) {
        state[S.stance] = "strength2";
      } else {
        state[S.stance] = stance;
      }
    } else {
      state[S.stance] = stance;
    }

    if (
      state[S.stance] != state[S.prevStance] &&
      state[S.stance] != `${state[S.prevStance]}2`
    ) {
      this.engine.effectManager.triggerEffects(state, STANCE_CHANGED_EFFECTS);
      this.engine.effectManager.triggerEffectsForPhase(state, "stanceChanged");
      if (state[S.stance].startsWith("preservation")) {
        state[S.preservationTimes]++;
      } else if (state[S.stance].startsWith("strength")) {
        state[S.strengthTimes]++;
      } else if (state[S.stance] == "fullPower") {
        state[S.fullPowerTimes]++;
      } else if (state[S.stance] == "leisure") {
        state[S.leisureTimes]++;
      }
      // Mirror the isDirectEffect resolver's definition of "direct":
      // card actions, card cost, a card moved to hand/held, or a scheduled
      // card-sourced reservation.
      if (
        state[S.phase] == "processCard" ||
        state[S.phase] == "processCost" ||
        state[S.phase] == "cardMovedToHand" ||
        state[S.phase] == "cardMovedToHeld" ||
        (state[S.triggeredEffect]?.type === "reservation" &&
          state[S.triggeredEffect]?.source?.type === "skillCardEffect")
      ) {
        state[S.stanceChangedByDirectEffectTimes]++;
      }
    }

    // Unlike stanceChanged, this also fires on same-stance upgrades
    // (e.g. strength -> strength2), which don't count as stance changes
    // in game.
    if (state[S.stance] != state[S.prevStance]) {
      this.engine.effectManager.triggerEffectsForPhase(
        state,
        "stanceValueChanged",
      );
    }
  }

  resetStance(state) {
    state[S.prevStance] = state[S.stance];
    state[S.stance] = "none";
  }
}
