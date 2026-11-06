import { useState } from "react";
import { useTranslations } from "next-intl";
import { SkillCards } from "gakumas-data";
import { S } from "gakumas-engine";
import Button from "@/components/Button";
import EntityIcon from "@/components/EntityIcon";
import Modal from "@/components/Modal";
import c from "@/utils/classNames";
import { EntityTypes } from "@/utils/entities";
import styles from "./ManualPlay.module.scss";

export default function HoldModal({ decision, onDecision, idolId }) {
  const t = useTranslations("stage");
  const { state, cards, num, optional } = decision;
  const [selectedIndices, setSelectedIndices] = useState([]);
  const promptKey =
    {
      HOLD_SELECTION: "selectCardsToHold",
      MOVE_TO_TOP_OF_DECK_SELECTION: "selectCardsToMoveToTopOfDeck",
    }[decision.type] ?? "selectCardsToMoveToHand";

  const toggleCard = (arrayIndex) => {
    setSelectedIndices((prev) => {
      if (prev.includes(arrayIndex)) {
        return prev.filter((i) => i !== arrayIndex);
      } else if (prev.length < num) {
        return [...prev, arrayIndex];
      }
      return prev;
    });
  };

  return (
    <Modal dismissable={false}>
      <h3>
        {t(promptKey, { num })}
      </h3>
      <div className={styles.cardGrid}>
        {cards.map((cardIndex, arrayIndex) => {
          const card = state[S.cardMap][cardIndex];
          const isSelected = selectedIndices.includes(arrayIndex);
          return (
            <button
              key={arrayIndex}
              className={c(styles.holdCard, isSelected && styles.selected)}
              onClick={() => toggleCard(arrayIndex)}
            >
              <div className={styles.imgWrapper}>
                <EntityIcon
                  type={EntityTypes.SKILL_CARD}
                  id={card.id}
                  customizations={card.c11n}
                  idolId={idolId}
                  size="fill"
                />
              </div>
              {SkillCards.getById(card.id).name}
            </button>
          );
        })}
      </div>
      <Button
        style="blue"
        fill
        onClick={() => onDecision(selectedIndices)}
        disabled={
          optional
            ? selectedIndices.length > num
            : selectedIndices.length !== num
        }
      >
        {t("confirm")} ({selectedIndices.length}/{num})
      </Button>
    </Modal>
  );
}
