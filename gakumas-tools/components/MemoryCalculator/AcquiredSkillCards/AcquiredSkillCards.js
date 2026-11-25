import { memo, useContext } from "react";
import EntityIcon from "@/components/EntityIcon";
import EntityPickerModal from "@/components/EntityPickerModal";
import MemoryCalculatorContext from "@/contexts/MemoryCalculatorContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import ModalContext from "@/contexts/ModalContext";
import { EntityTypes } from "@/utils/entities";
import { ACQUIRED_FILTER } from "@/utils/memoryPickerFilters";
import styles from "./AcquiredSkillCards.module.scss";

const FILTERS = [ACQUIRED_FILTER];

function AcquiredSkillCards() {
  const { acquiredSkillCardIds, replaceAcquiredCardId } = useContext(
    MemoryCalculatorContext
  );
  const { setModal } = useContext(ModalContext);
  const { idolId } = useContext(WorkspaceContext);

  return (
    <div className={styles.skillCards}>
      {acquiredSkillCardIds.map((skillCardId, index) => (
        <EntityIcon
          key={`${index}_${skillCardId}`}
          type={EntityTypes.SKILL_CARD}
          id={skillCardId}
          onClick={() =>
            setModal(
              <EntityPickerModal
                type={EntityTypes.SKILL_CARD}
                onPick={(card) => replaceAcquiredCardId(index, card.id)}
                filters={FILTERS}
              />
            )
          }
          idolId={idolId}
          showTier
          showEmptyPlaceholder
        />
      ))}
    </div>
  );
}

export default memo(AcquiredSkillCards);
