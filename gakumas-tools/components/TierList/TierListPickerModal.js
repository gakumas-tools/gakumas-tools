import { memo, useMemo, useRef } from "react";
import EntityIcon from "@/components/EntityIcon";
import Image from "@/components/Image";
import Modal from "@/components/Modal";
import {
  usePopOnActivate,
  usePopOnChange,
} from "@/utils/usePop";
import c from "@/utils/classNames";
import {
  COMPARE_FN_BY_TYPE,
  ENTITY_DATA_BY_TYPE,
  isEntityHidden,
} from "@/utils/entities";
import styles from "./TierListPickerModal.module.scss";

const PickerEntity = memo(function PickerEntity({
  type,
  id,
  pickedTier,
  isCurrent,
  onPick,
}) {
  const pop = usePopOnActivate(isCurrent);
  const badgePop = usePopOnChange(pickedTier);

  return (
    <div
      className={c(
        styles.cell,
        pickedTier && styles.picked,
        isCurrent && styles.current,
        pop && styles.currentPop,
      )}
    >
      <EntityIcon type={type} id={id} size="fill" onClick={onPick} />
      {pickedTier && (
        <div
          key={pickedTier}
          className={c(styles.tierBadge, badgePop && styles.tierBadgeIn)}
          aria-label={pickedTier}
        >
          <Image
            src={`/ranks/${pickedTier}.png`}
            alt={pickedTier}
            width={28}
            height={20}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
});

function TierListPickerModal({
  type,
  tierKey,
  pickedById = {},
  onPick,
  onClose,
}) {
  const entities = useMemo(() => {
    const all = ENTITY_DATA_BY_TYPE[type]
      .getAll()
      .filter((e) => !isEntityHidden(type, e.id));
    const compareFn = (a, b) => COMPARE_FN_BY_TYPE[type](b, a);
    return all.slice().sort(compareFn);
  }, [type]);

  // Stabilize onPick so memoized PickerEntity rows don't re-render on every
  // state change.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const stableOnPick = useMemo(() => (entity) => onPickRef.current(entity), []);

  return (
    <Modal onClose={onClose}>
      <div className={styles.picker}>
        <div className={styles.entities}>
          {entities.map((entity) => {
            const pickedTier = pickedById[entity.id];
            return (
              <PickerEntity
                key={`${type}_${entity.id}`}
                type={type}
                id={entity.id}
                pickedTier={pickedTier}
                isCurrent={pickedTier === tierKey}
                onPick={stableOnPick}
              />
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export default memo(TierListPickerModal);
