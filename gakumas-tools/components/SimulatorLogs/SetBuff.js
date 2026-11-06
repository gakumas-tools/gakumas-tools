import { memo } from "react";
import { useTranslations } from "next-intl";
import styles from "./SimulatorLogs.module.scss";

function SetBuff({ label, amount, turns, flat }) {
  const t = useTranslations("stage");

  return (
    <div className={styles.line}>
      {label}{" "}
      <span className={styles.value}>
        {amount >= 0 ? "+" : ""}
        {flat ? amount : `${parseFloat((amount * 100).toFixed(2))}%`}
      </span>{" "}
      {turns ? (
        <span className={styles.turns}>
          ({t("numTurns", { num: turns })})
        </span>
      ) : (
        ""
      )}
    </div>
  );
}

export default memo(SetBuff);
