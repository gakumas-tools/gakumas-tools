import { memo, useContext } from "react";
import { useTranslations } from "next-intl";
import EntityIcon from "@/components/EntityIcon";
import EntityPickerModal from "@/components/EntityPickerModal";
import Select from "@/components/Select";
import LoadoutContext, {
  LoadoutActionsContext,
} from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import { EntityTypes } from "@/utils/entities";
import styles from "./StagePDrinks.module.scss";

// The P-drinks held going into a produce exam, each with the turn it is
// drunk in: auto (0) leaves the turn to the simulator, which plans it before
// its runs (plannedTurns, under the loadout's slots, once it has).
function StagePDrinks({ plannedTurns }) {
  const t = useTranslations("StagePDrinks");
  const { loadout, stage } = useContext(LoadoutContext);
  const { replacePDrinkId, setPDrinkTurn } = useContext(LoadoutActionsContext);
  const { setModal } = useContext(ModalContext);
  const turnCount = stage.turnTypes?.length || stage.turnCount || 1;
  const turns = Array.from({ length: turnCount }, (_, i) => i + 1);

  return (
    <div className={styles.stagePDrinks}>
      <label>{t("label")}</label>
      <div className={styles.slots}>
        {loadout.pDrinkIds.map((pDrinkId, index) => (
          <div key={`${index}_${pDrinkId}`} className={styles.slot}>
            <div className={styles.icon}>
              <EntityIcon
                type={EntityTypes.P_DRINK}
                id={pDrinkId}
                onClick={() =>
                  setModal(
                    <EntityPickerModal
                      type={EntityTypes.P_DRINK}
                      onPick={(drink) => replacePDrinkId(index, drink.id)}
                    />,
                  )
                }
                size="fill"
                showEmptyPlaceholder
              />
            </div>
            {!!pDrinkId && (
              <Select
                size="sm"
                fill
                value={loadout.pDrinkTurns?.[index] || 0}
                options={[
                  { value: 0, label: t("auto") },
                  ...turns.map((turn) => ({
                    value: turn,
                    label: t("turn", { turn }),
                  })),
                ]}
                onChange={(turn) => setPDrinkTurn(index, turn)}
                aria-label={t("turnLabel", { slot: index + 1 })}
              />
            )}
            {!!pDrinkId &&
              !loadout.pDrinkTurns?.[index] &&
              plannedTurns?.[index] !== undefined && (
                <span className={styles.planned}>
                  {plannedTurns[index]
                    ? t("planned", { turn: plannedTurns[index] })
                    : t("plannedAnyTurn")}
                </span>
              )}
          </div>
        ))}
      </div>
      <p className={styles.note}>{t("note")}</p>
    </div>
  );
}

export default memo(StagePDrinks);
