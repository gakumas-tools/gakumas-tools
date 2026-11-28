import { useState } from "react";
import { useTranslations } from "next-intl";
import { SkillCards } from "gakumas-data";
import { S } from "gakumas-engine";
import Button from "@/components/Button";
import EntityIcon from "@/components/EntityIcon";
import Modal from "@/components/Modal";
import c from "@/utils/classNames";
import { EntityTypes } from "@/utils/entities";
import styles from "@/components/Simulator/ManualPlay.module.scss";

const MAX_HAND = 5;

const PILES = [
  [S.handCards, "hand"],
  [S.deckCards, "deck"],
  [S.discardedCards, "discardPile"],
];

// A pile by card id, not in pile order, so the deck doesn't show what's
// drawn next.
function sortedByCard(state, pile) {
  return [...state[pile]].sort(
    (a, b) => state[S.cardMap][a].id - state[S.cardMap][b].id || a - b
  );
}

// Picks the hand the game shows from the simulator's hand, deck and discard
// pile, so the next choice (and the simulator's pick) starts from it.
export default function SetHandModal({ state, idolId, onConfirm, onClose }) {
  const t = useTranslations("stage");
  const [selected, setSelected] = useState(state[S.handCards]);

  const toggleCard = (card) => {
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      if (prev.length < MAX_HAND) return [...prev, card];
      return prev;
    });
  };

  return (
    <Modal onClose={onClose}>
      <h3>{t("setHandPrompt", { num: MAX_HAND })}</h3>
      {PILES.map(([pile, label]) =>
        state[pile].length ? (
          <div key={label}>
            <h4>{t(label)}</h4>
            <div className={styles.cardGrid}>
              {sortedByCard(state, pile).map((card) => {
                const { id, c11n } = state[S.cardMap][card];
                return (
                  <button
                    key={card}
                    type="button"
                    className={c(
                      styles.holdCard,
                      selected.includes(card) && styles.selected
                    )}
                    onClick={() => toggleCard(card)}
                  >
                    <div className={styles.imgWrapper}>
                      <EntityIcon
                        type={EntityTypes.SKILL_CARD}
                        id={id}
                        customizations={c11n}
                        idolId={idolId}
                        size="fill"
                      />
                    </div>
                    {SkillCards.getById(id).name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
      <Button
        style="blue"
        fill
        onClick={() => onConfirm(selected)}
        disabled={!selected.length}
      >
        {t("confirm")} ({selected.length}/{MAX_HAND})
      </Button>
    </Modal>
  );
}
