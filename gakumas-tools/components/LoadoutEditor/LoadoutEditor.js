"use client";
import { memo, useCallback, useContext, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import LoadoutParams from "@/components/LoadoutParams";
import StaminaCalculator from "@/components/StaminaCalculator";
import StagePItems from "@/components/StagePItems";
import LoadoutSkillCardGroup from "@/components/LoadoutSkillCardGroup";
import LoadoutContext, {
  LoadoutActionsContext,
} from "@/contexts/LoadoutContext";
import { getIndications } from "@/utils/simulator";
import { formatStageShortName } from "@/utils/stages";
import SwapDndContext from "./SwapDndContext";
import styles from "./LoadoutEditor.module.scss";

const SPRING = "cubic-bezier(0.32, 1.34, 0.52, 1)";
const POP = "cubic-bezier(0.32, 1.48, 0.52, 1)";
const APPEAR = [
  { opacity: 0, transform: "scale(0.94)" },
  { opacity: 1, transform: "none" },
];

function animateGroups(elements, { tops, sourceOf, lifted }) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  elements.forEach((el, i) => {
    if (!el) return;
    const source = sourceOf(i);
    if (source == null) {
      el.animate(APPEAR, { duration: 340, easing: POP });
      return;
    }
    const dy = tops[source] - el.getBoundingClientRect().top;
    if (!dy) return;
    const from = `translateY(${dy}px)`;
    const keyframes =
      i === lifted
        ? [
            { transform: `${from} scale(1.03)`, zIndex: 1 },
            { transform: "none", zIndex: 1 },
          ]
        : [{ transform: from }, { transform: "none" }];
    el.animate(keyframes, { duration: 420, easing: SPRING });
  });
}

function LoadoutEditor({ config, idolId }) {
  const t = useTranslations("Simulator");

  const { stage, loadout, setParams, replacePItemId, swapPItemIds } =
    useContext(LoadoutContext);
  const {
    insertSkillCardIdGroup,
    deleteSkillCardIdGroup,
    swapSkillCardIdGroups,
  } = useContext(LoadoutActionsContext);

  const groupRefs = useRef([]);
  const pendingMotion = useRef(null);

  const recordMotion = useCallback((sourceOf, lifted) => {
    pendingMotion.current = {
      tops: groupRefs.current.map((el) => el?.getBoundingClientRect().top),
      sourceOf,
      lifted,
    };
  }, []);

  const insertGroup = useCallback(
    (index) => {
      recordMotion((i) => (i < index ? i : i == index ? null : i - 1));
      insertSkillCardIdGroup(index);
    },
    [recordMotion, insertSkillCardIdGroup],
  );

  const moveGroup = useCallback(
    (from, to) => {
      recordMotion((i) => (i == from ? to : i == to ? from : i), to);
      swapSkillCardIdGroups(from, to);
    },
    [recordMotion, swapSkillCardIdGroups],
  );

  const deleteGroup = useCallback(
    (index) => {
      recordMotion((i) => (i < index ? i : i + 1));
      deleteSkillCardIdGroup(index);
    },
    [recordMotion, deleteSkillCardIdGroup],
  );

  useLayoutEffect(() => {
    const motion = pendingMotion.current;
    if (!motion) return;
    pendingMotion.current = null;
    animateGroups(groupRefs.current, motion);
  }, [loadout.skillCardIdGroups]);

  const { pItemIndications, skillCardIndicationGroups } = getIndications(
    config,
    loadout
  );

  const staminaMemorySlots = loadout.skillCardIdGroups
    .slice(0, 2)
    .map((skillCardIds, index) => ({
      index,
      multiplier: stage.type !== "linkContest" && index ? 0.2 : 1,
      pIdolId: config.idol.inferPIdolId(
        index ? [] : loadout.pItemIds,
        skillCardIds,
      ),
      hasCards: skillCardIds.some((id) => id),
    }))
    .filter(({ index, pIdolId, hasCards }) => index === 0 || pIdolId || hasCards);

  return (
    <SwapDndContext>
      <div className={styles.loadoutEditor}>
        <LoadoutParams
          params={loadout.params}
          onChange={setParams}
          withStamina
          staminaAction={
            <StaminaCalculator
              memorySlots={staminaMemorySlots}
              onApply={(stamina) =>
                setParams([...loadout.params.slice(0, 3), stamina])
              }
            />
          }
          typeMultipliers={config.typeMultipliers}
        />
        <div className={styles.pItemsRow}>
          <div className={styles.pItems}>
            <StagePItems
              pItemIds={loadout.pItemIds}
              replacePItemId={replacePItemId}
              swapPItemIds={swapPItemIds}
              indications={pItemIndications}
              size="medium"
              produceExam={!!stage.produceExamId}
            />
          </div>
          <span className={styles.stageTag}>
            {formatStageShortName(stage, t)}
          </span>
        </div>
        {loadout.skillCardIdGroups.map((skillCardIdGroup, i) => (
          <div
            key={i}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            className={styles.group}
          >
            <LoadoutSkillCardGroup
              skillCardIds={skillCardIdGroup}
              customizations={loadout.customizationGroups[i]}
              indications={skillCardIndicationGroups[i]}
              groupIndex={i}
              groupCount={loadout.skillCardIdGroups.length}
              idolId={config.idol.idolId || idolId}
              onInsert={insertGroup}
              onMove={moveGroup}
              onDelete={deleteGroup}
            />
          </div>
        ))}
      </div>
    </SwapDndContext>
  );
}

export default memo(LoadoutEditor);
