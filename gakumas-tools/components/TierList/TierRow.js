import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaPlus, FaXmark } from "react-icons/fa6";
import EntityIcon from "@/components/EntityIcon";
import Image from "@/components/Image";
import c from "@/utils/classNames";
import styles from "./TierList.module.scss";

const TONE_BY_RANK = {
  S5: "prism",
  "S4+": "prism",
  S4: "prism",
  "SSS+": "dance",
  SSS: "dance",
  "SS+": "dance",
  SS: "dance",
  "S+": "visual",
  S: "visual",
  "A+": "vocal",
  A: "vocal",
  "B+": "accent",
  B: "accent",
  "C+": "stamina",
  C: "stamina",
  D: "dance",
  E: "muted",
  F: "muted",
};

function DeltaBadge({ delta }) {
  if (!delta) return null;
  return (
    <span className={c(styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown)}>
      {delta > 0 ? "↑" : "↓"}
      {Math.abs(delta)}
    </span>
  );
}

function SortableItem({ type, id, animateMount, delta }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const [appear] = useState(animateMount);
  const [drops, setDrops] = useState({ dragging: isDragging, count: 0 });
  if (drops.dragging !== isDragging) {
    setDrops({
      dragging: isDragging,
      count: isDragging ? drops.count : drops.count + 1,
    });
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={c(
        styles.item,
        appear && !drops.count && styles.itemEnter,
        drops.count > 0 &&
          (drops.count % 2 ? styles.itemLandA : styles.itemLandB),
        isDragging && styles.itemPlaceholder,
      )}
    >
      <EntityIcon type={type} id={id} size="fill" />
      <DeltaBadge delta={delta} />
    </div>
  );
}

function TierRow({
  type,
  tierKey,
  ids,
  deltas,
  canDelete,
  addAbove,
  addBelow,
  isDragActive,
  animateMount,
  leaving,
  onAdd,
  onAddTier,
  onDeleteTier,
  onLeft,
}) {
  const t = useTranslations("TierList");
  const { setNodeRef: setItemsRef, isOver: isContainerOver } = useDroppable({
    id: tierKey,
  });
  const [appear] = useState(animateMount);

  return (
    <div
      className={c(
        styles.rowWrap,
        appear && styles.rowEnter,
        leaving && styles.rowLeave,
      )}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onLeft(tierKey);
      }}
    >
      <div className={styles.row}>
        <div className={styles.tierLabel}>
          <div
            className={c(
              styles.tierTile,
              styles[TONE_BY_RANK[tierKey] || "muted"],
            )}
          >
            {addAbove && (
              <button
                type="button"
                className={c(styles.tierAdd, styles.tierAddTop)}
                onClick={() => onAddTier(addAbove)}
                aria-label={t("addRankTier", { rank: addAbove })}
                data-export-ignore="true"
              >
                <FaPlus />
                {addAbove}
              </button>
            )}
            <Image
              src={`/ranks/${tierKey}.png`}
              alt={tierKey}
              width={48}
              height={48}
              draggable={false}
            />
            {canDelete && (
              <button
                type="button"
                className={styles.tierDeleteBtn}
                onClick={() => onDeleteTier(tierKey)}
                aria-label={t("removeRankTier", { rank: tierKey })}
                data-export-ignore="true"
              >
                <FaXmark />
              </button>
            )}
            {addBelow && (
              <button
                type="button"
                className={c(styles.tierAdd, styles.tierAddBottom)}
                onClick={() => onAddTier(addBelow)}
                aria-label={t("addRankTier", { rank: addBelow })}
                data-export-ignore="true"
              >
                <FaPlus />
                {addBelow}
              </button>
            )}
          </div>
        </div>
        <div
          ref={setItemsRef}
          className={c(
            styles.items,
            isDragActive && styles.itemsCanDrop,
            isContainerOver && isDragActive && styles.itemsDropOver,
          )}
        >
          <SortableContext
            id={tierKey}
            items={ids}
            strategy={rectSortingStrategy}
          >
            {ids.map((id) => (
              <SortableItem
                key={id}
                type={type}
                id={id}
                animateMount={animateMount}
                delta={deltas?.[id]?.delta}
              />
            ))}
          </SortableContext>
          <button
            type="button"
            className={styles.addButton}
            aria-label={t("addItem")}
            onClick={() => onAdd(tierKey)}
            data-export-ignore="true"
          >
            <FaPlus />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(TierRow);
