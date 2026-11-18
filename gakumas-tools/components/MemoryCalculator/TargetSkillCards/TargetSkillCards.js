import { memo, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FaMinus, FaPlus } from "react-icons/fa6";
import EntityIcon from "@/components/EntityIcon";
import EntityPickerModal from "@/components/EntityPickerModal";
import MemoryCalculatorContext from "@/contexts/MemoryCalculatorContext";
import ModalContext from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import { EntityTypes } from "@/utils/entities";
import { TARGET_FILTER } from "@/utils/memoryPickerFilters";
import styles from "./TargetSkillCards.module.scss";

function Appear({ live, className, children }) {
  const [animate] = useState(live);

  return <div className={c(className, animate && styles.pop)}>{children}</div>;
}

function TargetSkillCards({ idolId }) {
  const t = useTranslations("TargetSkillCards");
  const [live, setLive] = useState(false);

  const {
    targetSkillCardIds,
    alternateSkillCardIds,
    addAlternateSkillCards,
    targetNegations,
    setNegation,
    acquiredSkillCardIds,
    replaceTargetCardId,
    replaceAlternateCardId,
  } = useContext(MemoryCalculatorContext);
  const { setModal } = useContext(ModalContext);

  const filters = useMemo(
    () => [
      TARGET_FILTER,
      {
        label: t("acquired"),
        callback: (e) => acquiredSkillCardIds.includes(e.id),
        default: acquiredSkillCardIds.some((id) => id),
      },
    ],
    [acquiredSkillCardIds, t]
  );

  return (
    <div
      className={c(styles.targetSkillCards, live && styles.live)}
      onClickCapture={() => setLive(true)}
    >
      {targetSkillCardIds.map((skillCardId, index) => {
        const alternates = alternateSkillCardIds[index];
        const negated = !!targetNegations[index];
        return (
          <div
            key={`${index}_${skillCardId}`}
            className={c(styles.slot, negated && styles.negated)}
          >
            <button
              className={styles.negate}
              aria-pressed={negated}
              onClick={() => setNegation(index, !negated)}
            >
              <FaMinus className={styles.minus} />
              <span className={styles.not}>NOT</span>
            </button>

            <div
              className={c(
                styles.orGroup,
                alternates?.length && styles.hasMultiple
              )}
            >
              <EntityIcon
                type={EntityTypes.SKILL_CARD}
                id={skillCardId}
                onClick={() =>
                  setModal(
                    <EntityPickerModal
                      type={EntityTypes.SKILL_CARD}
                      onPick={(card) => replaceTargetCardId(index, card.id)}
                      filters={filters}
                    />
                  )
                }
                idolId={idolId}
                size="fill"
                showTier
                showEmptyPlaceholder
              />

              {alternates?.map((altSkillCardId, altIndex) => (
                <Appear
                  key={`${index}_${altIndex}_${skillCardId}_${altSkillCardId}`}
                  live={live}
                  className={styles.alternate}
                >
                  <span className={styles.or}>OR</span>
                  <EntityIcon
                    type={EntityTypes.SKILL_CARD}
                    id={altSkillCardId}
                    onClick={() =>
                      setModal(
                        <EntityPickerModal
                          type={EntityTypes.SKILL_CARD}
                          onPick={(card) =>
                            replaceAlternateCardId(
                              index * 10 + altIndex,
                              card.id
                            )
                          }
                          filters={filters}
                        />
                      )
                    }
                    idolId={idolId}
                    size="fill"
                    showTier
                  />
                </Appear>
              ))}
            </div>

            {alternates?.length != 10 &&
              alternates?.[alternates.length - 1] != 0 && (
                <Appear live={live} className={styles.addWrap}>
                  <button
                    className={styles.add}
                    onClick={() => addAlternateSkillCards(index)}
                  >
                    <FaPlus />
                  </button>
                </Appear>
              )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(TargetSkillCards);
