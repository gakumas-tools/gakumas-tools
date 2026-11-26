import React, { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { PDrinks, SkillCards } from "gakumas-data";
import Button from "@/components/Button";
import Collapse from "@/components/Collapse";
import EntityIcon from "@/components/EntityIcon";
import c from "@/utils/classNames";
import { EntityTypes } from "@/utils/entities";
import HandState from "./HandState";
import HandTitle from "./HandTitle";
import styles from "./SimulatorLogs.module.scss";

function InteractiveHand({
  handCards,
  scores,
  selectedIndex,
  state,
  idolId,
  pendingDecision,
  onDecision,
}) {
  const t = useTranslations("stage");

  const [expanded, setExpanded] = useState(true);

  const handRef = React.useRef(null);
  React.useEffect(() => {
    if (handRef.current) {
      handRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const getCardIndex = (i) => {
    return pendingDecision?.handCards[i];
  };

  const isCardUsable = (i) => {
    const cardIndex = getCardIndex(i);
    return pendingDecision?.usableCards.includes(cardIndex);
  };

  const handleCardClick = (i) => {
    const cardIndex = getCardIndex(i);
    if (isCardUsable(i)) {
      onDecision(cardIndex);
    }
  };

  const handleEndTurn = () => {
    onDecision(null);
  };

  // The P-drinks still held: one may be drunk now, before the next card.
  const pDrinks = pendingDecision?.pDrinks || [];

  return (
    <div ref={handRef} className={c(styles.hand, styles.pending)}>
      <HandTitle
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      <Collapse open={expanded}>
        <HandState state={state} />
      </Collapse>
      <div className={styles.handCards}>
        {handCards.map((card, i) => (
          <button
            key={i}
            type="button"
            className={c(
              styles.handCard,
              i === selectedIndex && styles.selected,
              scores[i] === -Infinity && styles.unusable,
              styles.interactive,
              !isCardUsable(i) && styles.unusable
            )}
            onClick={() => handleCardClick(i)}
            disabled={!isCardUsable(i)}
          >
            <div className={styles.imgWrapper}>
              <EntityIcon
                type={EntityTypes.SKILL_CARD}
                id={card.id}
                customizations={card.c}
                idolId={idolId}
                size="fill"
              />
            </div>
            <span className={styles.cardName}>
              {SkillCards.getById(card.id).name}
            </span>
          </button>
        ))}
      </div>
      {pDrinks.length > 0 && (
        <div className={styles.pDrinks}>
          {pDrinks.map((id, index) => (
            <Button
              key={index}
              size="sm"
              onClick={() => onDecision({ pDrink: index })}
              ariaLabel={t("drink", { name: PDrinks.getById(id).name })}
            >
              <span className={styles.pDrinkIcon}>
                <EntityIcon type={EntityTypes.P_DRINK} id={id} size="fill" />
              </span>
              {PDrinks.getById(id).name}
            </Button>
          ))}
        </div>
      )}
      <div className={styles.skip}>
        <Button fill onClick={handleEndTurn}>
          {t("skip")}
        </Button>
      </div>
    </div>
  );
}

export default memo(InteractiveHand);
