import { memo, useContext } from "react";
import { useTranslations } from "next-intl";
import { TURN_TYPES } from "gakumas-loadout";
import LoadoutContext, { LoadoutActionsContext } from "@/contexts/LoadoutContext";
import c from "@/utils/classNames";
import styles from "./TurnOrder.module.scss";

// A produce exam shows its turn order before it starts, and it changes
// between runs. Each tap cycles one turn through Vo, Da and Vi.
function TurnOrder() {
  const t = useTranslations("TurnOrder");
  const { stage } = useContext(LoadoutContext);
  const { setTurnType } = useContext(LoadoutActionsContext);

  if (!stage.turnTypes) return null;

  function cycle(turnIndex) {
    const current = TURN_TYPES.indexOf(stage.turnTypes[turnIndex]);
    setTurnType(turnIndex, TURN_TYPES[(current + 1) % TURN_TYPES.length]);
  }

  return (
    <div className={styles.turnOrder}>
      <label>{t("label")}</label>
      <div className={styles.turns}>
        {stage.turnTypes.map((type, i) => (
          <button
            key={i}
            type="button"
            className={c(styles.turn, styles[type])}
            aria-label={t("turnLabel", { turn: i + 1, type: t(type) })}
            onClick={() => cycle(i)}
          >
            {t(`${type}Short`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(TurnOrder);
