import { useTranslations } from "next-intl";
import { ALL_FIELDS, S } from "gakumas-engine";
import TurnIndicator from "./TurnIndicator";
import styles from "./SimulatorLogs.module.scss";

const BUFFS_MAP = {
  [S.scoreBuffs]: "scoreBuff",
  [S.scoreDebuffs]: "scoreDebuff",
  [S.goodImpressionTurnsBuffs]: "goodImpressionTurnsBuff",
  [S.goodImpressionTurnsEffectBuffs]: "goodImpressionTurnsEffectBuff",
  [S.goodImpressionTurnsTimesBuffs]: "goodImpressionTurnsTimesBuff",
  [S.motivationBuffs]: "motivationBuff",
  [S.motivationAdditionBuffs]: "motivationAdditionBuff",
  [S.goodConditionTurnsBuffs]: "goodConditionTurnsBuff",
  [S.goodConditionTurnsAdditionBuffs]: "goodConditionTurnsAdditionBuff",
  [S.concentrationBuffs]: "concentrationBuff",
  [S.concentrationAdditionBuffs]: "concentrationAdditionBuff",
  [S.concentrationEffectBuffs]: "concentrationEffectBuff",
  [S.enthusiasmBuffs]: "enthusiasmBuff",
  [S.enthusiasmBonusBuffs]: "enthusiasmBonus",
  [S.fullPowerChargeBuffs]: "fullPowerChargeBuff",
  [S.fullPowerEffectBuffs]: "fullPowerEffectBuff",
  [S.strengthEffectBuffs]: "strengthEffectBuff",
};

// Same as FLAT_BUFF_LOG_TYPES in Logs.js.
const FLAT_BUFFS = {
  [S.enthusiasmBonusBuffs]: true,
  [S.goodImpressionTurnsTimesBuffs]: true,
  [S.goodConditionTurnsAdditionBuffs]: true,
  [S.concentrationAdditionBuffs]: true,
  [S.motivationAdditionBuffs]: true,
};

function HandStateLine({ k, state }) {
  const t = useTranslations("stage");

  const buffKey = BUFFS_MAP[k];

  if (buffKey) {
    const flat = FLAT_BUFFS[k];
    return state[k].map(({ amount, turns }) => (
      <div key={turns} className={styles.stateTag}>
        {t(buffKey)}{" "}
        <span className={styles.value}>
          {flat ? amount : `${Math.round(amount * 100)}%`}
        </span>
        {turns ? (
          <span className={styles.turns}>
            ({t("numTurns", { num: turns })})
          </span>
        ) : null}
      </div>
    ));
  }

  return (
    <div className={styles.stateTag}>
      {t(ALL_FIELDS[k])}{" "}
      <span className={styles.value}>
        {isNaN(state[k]) ? t(state[k]) : state[k]}
      </span>
    </div>
  );
}

function HandState({ state }) {
  const { turn, ...rest } = state;

  return (
    <div className={styles.state}>
      <TurnIndicator turn={turn} />
      <div className={styles.stateLines}>
        {Object.keys(rest).map((k) => (
          <HandStateLine key={k} k={k} state={rest} />
        ))}
      </div>
    </div>
  );
}

export default HandState;
