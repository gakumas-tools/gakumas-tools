"use client";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { FaShareNodes } from "react-icons/fa6";
import ConfirmModal from "@/components/ConfirmModal";
import EntityIcon from "@/components/EntityIcon";
import ModalContext from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import NavigationGuardContext from "@/contexts/NavigationGuardContext";
import {
  EMPTY_LIST,
  decodeList,
  encodeList,
  isDefaultList,
} from "@/utils/tierList";
import EntityPool, { POOL_ID } from "./EntityPool";
import TierListPickerModal from "./TierListPickerModal";
import TierRow from "./TierRow";
import TierShareModal from "./TierShareModal";
import { AVAILABLE_RANKS, sortRanks } from "./ranks";
import styles from "./TierList.module.scss";

function findContainer(list, pickedById, id) {
  if (list.tiers.includes(id)) return id;
  return pickedById[id] ?? POOL_ID;
}

function TierList({ type }) {
  const t = useTranslations("TierList");
  const { setModal } = useContext(ModalContext);
  const { setGuard } = useContext(NavigationGuardContext);
  const searchParams = useSearchParams();

  const initialList = useMemo(() => {
    const d = searchParams?.get("d");
    if (d) {
      const decoded = decodeList(d);
      if (decoded) return decoded;
    }
    return EMPTY_LIST;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [list, setList] = useState(initialList);
  const listRef = useRef(list);
  listRef.current = list;

  const [pickerTier, setPickerTier] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [leaving, setLeaving] = useState([]);
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  // Defer URL sync until a drag finishes — hover-driven mid-drag list mutations
  // would otherwise rewrite the URL on every frame.
  useEffect(() => {
    if (activeId != null) return;
    const url = new URL(window.location.href);
    if (isDefaultList(list)) {
      url.searchParams.delete("d");
    } else {
      url.searchParams.set("d", encodeList(list));
    }
    window.history.replaceState(null, "", url);
  }, [list, activeId]);

  const pickedById = useMemo(() => {
    const m = {};
    for (const tierKey of list.tiers) {
      const ids = list.items[tierKey] || [];
      for (const id of ids) m[id] = tierKey;
    }
    return m;
  }, [list]);

  const allIdsCount = useMemo(
    () => Object.keys(pickedById).length,
    [pickedById],
  );

  const placeItem = useCallback((targetKey, targetIndex, id) => {
    setList((prev) => {
      if (!prev.tiers.includes(targetKey)) return prev;
      const nextItems = { ...prev.items };
      let oldTier = null;
      let oldIndex = -1;
      for (const k of prev.tiers) {
        const arr = nextItems[k] || [];
        const idx = arr.indexOf(id);
        if (idx !== -1) {
          oldTier = k;
          oldIndex = idx;
          break;
        }
      }
      if (oldTier) {
        const arr = [...nextItems[oldTier]];
        arr.splice(oldIndex, 1);
        nextItems[oldTier] = arr;
      }
      const targetArr = [...(nextItems[targetKey] || [])];
      let insertAt;
      if (targetIndex == null) {
        insertAt = targetArr.length;
      } else {
        let idx = targetIndex;
        if (oldTier === targetKey && oldIndex !== -1 && oldIndex < idx) idx -= 1;
        insertAt = Math.max(0, Math.min(idx, targetArr.length));
      }
      if (oldTier === targetKey && oldIndex === insertAt) return prev;
      targetArr.splice(insertAt, 0, id);
      nextItems[targetKey] = targetArr;
      return { ...prev, items: nextItems };
    });
  }, []);

  const removeItem = useCallback((tierKey, id) => {
    setList((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [tierKey]: (prev.items[tierKey] || []).filter((x) => x !== id),
      },
    }));
  }, []);

  // Read via ref so togglePickerItem can stay stable across list updates,
  // letting memoized PickerEntity rows skip re-rendering.
  const pickedByIdRef = useRef(pickedById);
  pickedByIdRef.current = pickedById;

  const togglePickerItem = useCallback(
    (entity) => {
      if (entity?.id == null || pickerTier == null) return;
      const id = entity.id;
      const currentTier = pickedByIdRef.current[id];
      if (currentTier === pickerTier) {
        removeItem(currentTier, id);
      } else {
        placeItem(pickerTier, null, id);
      }
    },
    [pickerTier, removeItem, placeItem],
  );

  const addTier = useCallback((rank) => {
    setList((prev) => {
      if (!AVAILABLE_RANKS.includes(rank) || prev.tiers.includes(rank)) {
        return prev;
      }
      return {
        tiers: sortRanks([...prev.tiers, rank]),
        items: { ...prev.items, [rank]: [] },
      };
    });
  }, []);

  const finishRemoveTier = useCallback((rank) => {
    setLeaving((prev) => prev.filter((k) => k !== rank));
    setList((prev) => {
      if (!prev.tiers.includes(rank) || prev.tiers.length <= 1) return prev;
      const nextTiers = prev.tiers.filter((k) => k !== rank);
      const nextItems = { ...prev.items };
      delete nextItems[rank];
      return { tiers: nextTiers, items: nextItems };
    });
  }, []);

  const removeTier = useCallback(
    (rank) => {
      const cur = listRef.current;
      const remaining = cur.tiers.length - leavingRef.current.length;
      if (!cur.tiers.includes(rank) || remaining <= 1) return;
      const apply = () =>
        setLeaving((prev) => (prev.includes(rank) ? prev : [...prev, rank]));
      const itemCount = (cur.items[rank] || []).length;
      if (itemCount > 0) {
        setModal(
          <ConfirmModal
            message={t("confirmRemoveTier", { rank, count: itemCount })}
            confirmLabel={t("removeRankTier", { rank })}
            danger
            onConfirm={apply}
          />,
        );
      } else {
        apply();
      }
    },
    [setModal, t],
  );

  const clearAll = useCallback(() => {
    setModal(
      <ConfirmModal
        message={t("confirmClear")}
        confirmLabel={t("clearAll")}
        danger
        onConfirm={() =>
          setList((prev) => ({
            ...prev,
            items: prev.tiers.reduce((acc, k) => {
              acc[k] = [];
              return acc;
            }, {}),
          }))
        }
      />,
    );
  }, [setModal, t]);

  useEffect(() => {
    if (allIdsCount === 0) {
      setGuard(null);
      return;
    }
    setGuard(
      () =>
        new Promise((resolve) => {
          setModal(
            <ConfirmModal
              message={t("confirmLeave")}
              onConfirm={() => resolve(true)}
              onCancel={() => resolve(false)}
            />,
          );
        }),
    );
    return () => setGuard(null);
  }, [allIdsCount, setGuard, setModal, t]);

  const canDeleteTier = list.tiers.length - leaving.length > 1;

  // After a cross-container hover-move, freeze `over` for one frame so a
  // mid-frame layout shift doesn't ping-pong the active item between
  // containers and blow React's update budget.
  const recentlyMovedRef = useRef(false);
  const lastOverIdRef = useRef(null);
  // Hover-moves write into the list mid-drag; a cancelled drag (Esc, resize,
  // touchcancel) restores the list from before it started.
  const dragStartListRef = useRef(null);
  const markMoved = () => {
    recentlyMovedRef.current = true;
    requestAnimationFrame(() => {
      recentlyMovedRef.current = false;
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const collisionDetection = useCallback((args) => {
    if (recentlyMovedRef.current && lastOverIdRef.current != null) {
      return [{ id: lastOverIdRef.current }];
    }

    const pointerHits = pointerWithin(args);

    const intersections =
      pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    if (intersections.length === 0) {
      return lastOverIdRef.current != null
        ? [{ id: lastOverIdRef.current }]
        : [];
    }

    const cur = listRef.current;
    let firstId = intersections[0].id;

    if (typeof firstId === "string" && cur.tiers.includes(firstId)) {
      const containerItems = cur.items[firstId] || [];
      if (containerItems.length > 0) {
        const inside = args.droppableContainers.filter((c) =>
          containerItems.includes(c.id),
        );
        const closer = closestCenter({ ...args, droppableContainers: inside });
        if (closer.length > 0) {
          lastOverIdRef.current = closer[0].id;
          return closer;
        }
      }
    }

    lastOverIdRef.current = firstId;
    return [{ id: firstId }];
  }, []);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
    dragStartListRef.current = listRef.current;
    lastOverIdRef.current = null;
    recentlyMovedRef.current = false;
    navigator.vibrate?.(8);
  }, []);

  const handleDragOver = useCallback((event) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overIdNow = over.id;
    if (activeId === overIdNow) return;

    const cur = listRef.current;
    const picked = pickedByIdRef.current;
    const activeContainer = findContainer(cur, picked, activeId);
    const overContainer = findContainer(cur, picked, overIdNow);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    if (overContainer === POOL_ID) {
      markMoved();
      setList((prev) => {
        const arr = prev.items[activeContainer] || [];
        if (!arr.includes(activeId)) return prev;
        return {
          ...prev,
          items: {
            ...prev.items,
            [activeContainer]: arr.filter((id) => id !== activeId),
          },
        };
      });
      return;
    }

    markMoved();
    setList((prev) => {
      const overItems = prev.items[overContainer] || [];
      const fromTier = activeContainer !== POOL_ID;
      const activeItems = fromTier ? prev.items[activeContainer] || [] : null;
      if (fromTier && !activeItems.includes(activeId)) return prev;

      let newIndex;
      if (overIdNow === overContainer) {
        newIndex = overItems.length;
      } else {
        const overIdx = overItems.indexOf(overIdNow);
        const isBelowOver =
          over.rect &&
          active.rect.current.translated &&
          active.rect.current.translated.top >
            over.rect.top + over.rect.height / 2;
        newIndex = overIdx >= 0 ? overIdx + (isBelowOver ? 1 : 0) : overItems.length;
      }

      const nextItems = { ...prev.items };
      if (fromTier) {
        nextItems[activeContainer] = activeItems.filter((id) => id !== activeId);
      }
      nextItems[overContainer] = [
        ...overItems.slice(0, newIndex),
        activeId,
        ...overItems.slice(newIndex),
      ];
      return { ...prev, items: nextItems };
    });
  }, []);

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      setActiveId(null);
      dragStartListRef.current = null;
      lastOverIdRef.current = null;
      recentlyMovedRef.current = false;
      if (!over) return;
      const activeId = active.id;
      const dropId = over.id;

      const cur = listRef.current;
      const picked = pickedByIdRef.current;
      const activeContainer = findContainer(cur, picked, activeId);
      const overContainer = findContainer(cur, picked, dropId);
      if (!activeContainer || !overContainer) return;
      if (activeContainer !== overContainer) return;
      if (activeContainer === POOL_ID) return;

      const items = cur.items[activeContainer] || [];
      const oldIndex = items.indexOf(activeId);
      const newIndex =
        dropId === overContainer ? items.length - 1 : items.indexOf(dropId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      setList((prev) => ({
        ...prev,
        items: {
          ...prev.items,
          [activeContainer]: arrayMove(prev.items[activeContainer], oldIndex, newIndex),
        },
      }));
    },
    [],
  );

  const handleDragCancel = useCallback(() => {
    if (dragStartListRef.current) setList(dragStartListRef.current);
    dragStartListRef.current = null;
    setActiveId(null);
    lastOverIdRef.current = null;
    recentlyMovedRef.current = false;
  }, []);

  return (
    <DndContext
      id="tier-list"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.tierList}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.headerButton}
            onClick={() => setShareOpen(true)}
          >
            <FaShareNodes />
            {t("share")}
          </button>
          <button
            type="button"
            className={c(styles.headerButton, styles.headerDanger)}
            onClick={clearAll}
            disabled={allIdsCount === 0}
          >
            {t("clearAll")}
          </button>
        </div>

        <div className={styles.tiers}>
          <div className={styles.tierRows}>
            {list.tiers.map((tierKey) => {
              const idx = AVAILABLE_RANKS.indexOf(tierKey);
              const aboveRank =
                idx > 0 && !list.tiers.includes(AVAILABLE_RANKS[idx - 1])
                  ? AVAILABLE_RANKS[idx - 1]
                  : null;
              const belowRank =
                idx >= 0 &&
                idx < AVAILABLE_RANKS.length - 1 &&
                !list.tiers.includes(AVAILABLE_RANKS[idx + 1])
                  ? AVAILABLE_RANKS[idx + 1]
                  : null;
              return (
                <TierRow
                  key={tierKey}
                  type={type}
                  tierKey={tierKey}
                  ids={list.items[tierKey] || []}
                  canDelete={canDeleteTier}
                  addAbove={aboveRank}
                  addBelow={belowRank}
                  isDragActive={activeId != null}
                  animateMount={ready}
                  leaving={leaving.includes(tierKey)}
                  onAdd={setPickerTier}
                  onAddTier={addTier}
                  onDeleteTier={removeTier}
                  onLeft={finishRemoveTier}
                />
              );
            })}
          </div>
        </div>

        <EntityPool type={type} list={list} />

        {pickerTier != null && list.tiers.includes(pickerTier) && (
          <TierListPickerModal
            type={type}
            tierKey={pickerTier}
            pickedById={pickedById}
            onPick={togglePickerItem}
            onClose={() => setPickerTier(null)}
          />
        )}

        {shareOpen && (
          <TierShareModal
            type={type}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>

      <DragOverlay
        dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1)" }}
      >
        {activeId != null ? (
          <div className={c(styles.item, styles.overlayItem)}>
            <EntityIcon type={type} id={activeId} size="fill" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default memo(TierList);
