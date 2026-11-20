import { memo, useContext } from "react";
import { useTranslations } from "next-intl";
import EntityIcon from "@/components/EntityIcon";
import EntityPickerModal from "@/components/EntityPickerModal";
import LoadoutContext, { LoadoutActionsContext } from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import { EntityTypes } from "@/utils/entities";
import styles from "./StagePDrinks.module.scss";

// The P-drinks held going into a produce exam. The simulator drinks them all
// at the start of turn 1 (in the game they can be drunk at any time).
function StagePDrinks() {
  const t = useTranslations("StagePDrinks");
  const { loadout } = useContext(LoadoutContext);
  const { replacePDrinkId } = useContext(LoadoutActionsContext);
  const { setModal } = useContext(ModalContext);

  return (
    <div className={styles.stagePDrinks}>
      <label>{t("label")}</label>
      <div className={styles.slots}>
        {loadout.pDrinkIds.map((pDrinkId, index) => (
          <EntityIcon
            key={`${index}_${pDrinkId}`}
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
            size="small"
            showEmptyPlaceholder
          />
        ))}
      </div>
      <p className={styles.note}>{t("note")}</p>
    </div>
  );
}

export default memo(StagePDrinks);
