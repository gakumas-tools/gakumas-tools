import { memo, useContext } from "react";
import EntityIcon from "@/components/EntityIcon";
import EntityPickerModal from "@/components/EntityPickerModal";
import ModalContext from "@/contexts/ModalContext";
import { EntityTypes } from "@/utils/entities";
import { pickablePItem } from "@/utils/pItemSlots";
import styles from "./StagePItems.module.scss";

function StagePItems({
  pItemIds,
  replacePItemId,
  swapPItemIds,
  indications,
  size,
  produceExam = false,
}) {
  const { setModal } = useContext(ModalContext);

  return (
    <div className={styles.stagePItems}>
      {pItemIds.map((pItemId, index) => (
        <EntityIcon
          key={`${index}_${pItemId}`}
          type={EntityTypes.P_ITEM}
          id={pItemId}
          index={index}
          indications={indications?.[index]}
          onClick={() =>
            setModal(
              <EntityPickerModal
                type={EntityTypes.P_ITEM}
                onPick={(card) => replacePItemId(index, card.id)}
                filters={[{ callback: (e) => pickablePItem(e, produceExam) }]}
              />
            )
          }
          onSwap={swapPItemIds}
          size={size}
          showEmptyPlaceholder
        />
      ))}
    </div>
  );
}

export default memo(StagePItems);
