import { memo, useMemo, useState } from "react";
import { PIdols, PItems } from "gakumas-data";
import gkImg from "gakumas-images";
import EntityIcon from "@/components/EntityIcon";
import Image from "@/components/Image";
import PIdol from "@/components/PIdol";
import c from "@/utils/classNames";
import { calculateContestPower } from "@/utils/contestPower";
import { EntityTypes } from "@/utils/entities";
import { getFilledSkillCardSlots } from "@/utils/memorySlots";
import MemorySummaryActionButtons from "./MemorySummaryActionButtons";
import styles from "./MemorySummary.module.scss";

const PARAMETER_NAMES = ["Vo", "Da", "Vi"];

function MemorySummary({ memory, picking, onClick }) {
  const { name, pIdolId, params, pItemIds, skillCardIds, customizations } =
    memory;
  const idolId = PIdols.getById(pIdolId)?.idolId;
  const [actionsShown, setActionsShown] = useState(false);
  const contestPower = calculateContestPower(
    params,
    pItemIds,
    skillCardIds,
    customizations
  );

  const pItems = useMemo(
    () => pItemIds.filter((p) => p).map(PItems.getById),
    [pItemIds]
  );
  const skillCards = useMemo(
    () => getFilledSkillCardSlots(skillCardIds),
    [skillCardIds]
  );

  const summaryContent = (
    <>
      <div
        className={styles.left}
        onClick={picking ? undefined : () => setActionsShown((v) => !v)}
      >
        <PIdol pIdolId={pIdolId} />
        {!picking && <MemorySummaryActionButtons memory={memory} />}
      </div>

      <div className={styles.details}>
        <span className={styles.text}>
          <span>{name}</span>
          <span>{contestPower}</span>
        </span>

        <div className={styles.row}>
          {pItems.map((pItem, i) => (
            <Image
              key={i}
              className={styles.pItem}
              src={gkImg(pItem).icon}
              width={35}
              height={35}
              alt={pItem.name}
              draggable={false}
            />
          ))}
          <div className={styles.filler} />
          <div className={styles.parameters}>
            {PARAMETER_NAMES.map((param, i) => (
              <span key={param} title={param}>
                {params[i] || 0}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          {skillCards.map(({ skillCard, slot }) => (
            <div key={slot} className={styles.imgWrapper}>
              <EntityIcon
                type={EntityTypes.SKILL_CARD}
                id={skillCard.id}
                customizations={customizations?.[slot]}
                idolId={idolId}
                size="fill"
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );

  if (picking) {
    return (
      <button type="button" className={styles.memorySummary} onClick={onClick}>
        {summaryContent}
      </button>
    );
  } else {
    return (
      <div
        className={c(styles.memorySummary, actionsShown && styles.actionsShown)}
      >
        {summaryContent}
      </div>
    );
  }
}

export default memo(MemorySummary);
