import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { PItems, SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import { getStage } from "gakumas-loadout";
import Image from "@/components/Image";
import { formatStageName } from "@/utils/stages";
import styles from "./LoadoutHistory.module.scss";

function LoadoutSummary({ loadout, showStage = true }) {
  const t = useTranslations("StageSummary");

  const { stageId, customStage, pItemIds, skillCardIdGroups } = loadout;

  const stage = useMemo(
    () => getStage(stageId, customStage),
    [stageId]
  );

  return (
    <>
      <div className={styles.itemsAndStage}>
        <div>
          {pItemIds
            .map(PItems.getById)
            .filter((p) => p)
            .map((pItem, i) => (
              <Image
                key={i}
                src={gkImg(pItem).icon}
                width={40}
                height={40}
                alt={pItem.name}
                draggable={false}
              />
            ))}
        </div>
        {showStage && (
          <span className={styles.stage}>{formatStageName(stage, t)}</span>
        )}
      </div>
      <div className={styles.cards}>
        {skillCardIdGroups.map((group, j) => (
          <div key={j}>
            {group
              .map(SkillCards.getById)
              .filter((c) => c)
              .map((skillCard, i) => (
                <Image
                  key={i}
                  src={gkImg(skillCard).icon}
                  width={40}
                  height={40}
                  alt={skillCard.name}
                  draggable={false}
                />
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default memo(LoadoutSummary);
