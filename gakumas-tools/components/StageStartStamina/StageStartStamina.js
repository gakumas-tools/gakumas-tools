import { memo, useContext } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/Input";
import LoadoutContext, {
  LoadoutActionsContext,
} from "@/contexts/LoadoutContext";
import styles from "./StageStartStamina.module.scss";

// The 体力 a produce exam starts at. The run's 体力 carries into the exam,
// so it can be below max; heals during the exam still stop at max.
function StageStartStamina() {
  const t = useTranslations("StageStartStamina");
  const { loadout } = useContext(LoadoutContext);
  const { setStartStamina } = useContext(LoadoutActionsContext);
  const maxStamina = loadout.params[3] || 0;

  return (
    <div className={styles.stageStartStamina}>
      <label htmlFor="start_stamina">{t("label")}</label>
      <div className={styles.row}>
        <Input
          id="start_stamina"
          className={styles.input}
          type="number"
          round
          min={0}
          max={maxStamina}
          value={loadout.startStamina}
          placeholder={String(maxStamina)}
          onChange={setStartStamina}
        />
        <span className={styles.max}>/ {maxStamina}</span>
      </div>
      <p className={styles.note}>{t("note")}</p>
    </div>
  );
}

export default memo(StageStartStamina);
