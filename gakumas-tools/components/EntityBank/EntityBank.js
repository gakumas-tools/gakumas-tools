import {
  memo,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { FaCheck, FaFilter, FaXmark } from "react-icons/fa6";
import { PIdols } from "gakumas-data";
import EntityIcon from "@/components/EntityIcon";
import PlanIdolSelects from "@/components/PlanIdolSelects";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import c from "@/utils/classNames";
import {
  COMPARE_FN_BY_TYPE,
  ENTITY_DATA_BY_TYPE,
  EntityTypes,
  isEntityHidden,
} from "@/utils/entities";
import { usePopOnActivate } from "@/utils/usePop";
import styles from "./EntityBank.module.scss";

const INITIAL_RENDER_COUNT = 96;
const NO_FILTERS = [];

function getEntities(type, { filter, plan, idolId }) {
  const Entities = ENTITY_DATA_BY_TYPE[type];
  const compareFn = COMPARE_FN_BY_TYPE[type];

  if (!filter) return [...Entities.getAll()].sort(compareFn);

  let signatureEntities = [];
  if (type !== EntityTypes.P_DRINK) {
    const pIdolIds = PIdols.getFiltered({
      idolIds: [idolId],
      plans: [plan],
    }).map((pi) => pi.id);
    signatureEntities = Entities.getFiltered({
      pIdolIds,
    });
  }

  const nonSignatureEntities = Entities.getFiltered({
    // Default cards are N, and a memory's Stage deck can hold them.
    rarities: ["N", "R", "SR", "SSR", "L"],
    plans: [plan, "free"],
    modes: ["stage"],
    sourceTypes: ["default", "produce", "support"],
    pIdolIds: [null],
  }).sort(compareFn);

  return signatureEntities.concat(nonSignatureEntities);
}

function FilterChip({ on, icon, onToggle, children }) {
  const pop = usePopOnActivate(on);
  return (
    <button
      type="button"
      className={c(styles.chip, on && styles.chipOn, pop && styles[`pop${pop}`])}
      aria-pressed={on}
      onClick={onToggle}
    >
      {icon}
      {children}
    </button>
  );
}

function EntityBank({
  type,
  onClick,
  selectedId,
  filters = NO_FILTERS,
  includeNull = true,
  progressive = false,
}) {
  const t = useTranslations("EntityBank");

  const { filter, setFilter, plan, setPlan, idolId, setIdolId } =
    useContext(WorkspaceContext);
  const [enabledCustomFilters, setEnabledCustomFilters] = useState(
    filters.reduce(
      (acc, cur) => ({ ...acc, [cur.label]: !cur.label || cur.default }),
      {},
    ),
  );
  const [renderAll, setRenderAll] = useState(!progressive);

  useEffect(() => {
    if (!renderAll) startTransition(() => setRenderAll(true));
  }, [renderAll]);

  const entities = useMemo(() => {
    let result = getEntities(type, { filter, plan, idolId }).filter(
      (e) => !isEntityHidden(type, e.id),
    );
    for (let customFilter of filters) {
      if (!customFilter.label || enabledCustomFilters[customFilter.label]) {
        result = result.filter(customFilter.callback);
      }
    }
    return result;
  }, [type, filter, plan, idolId, filters, enabledCustomFilters]);

  const visibleEntities = renderAll
    ? entities
    : entities.slice(0, INITIAL_RENDER_COUNT);

  const filterPop = usePopOnActivate(!!filter);

  const toggleableFilters = useMemo(
    () => filters.filter((f) => f.label),
    [filters],
  );

  return (
    <>
      <div className={styles.entities}>
        {includeNull && (
          <div className={styles.cell}>
            <EntityIcon type={type} onClick={onClick} size="fill" />
          </div>
        )}
        {visibleEntities.map((entity) => (
          <div
            key={`${type}_${entity.id}`}
            className={c(
              styles.cell,
              entity.id == selectedId && styles.selected,
            )}
          >
            <EntityIcon
              type={type}
              id={entity.id}
              idolId={idolId}
              onClick={onClick}
              size="fill"
              showTier
            />
          </div>
        ))}
        {!entities.length && (
          <p className={styles.noMatches}>{t("noMatches")}</p>
        )}
      </div>

      <div className={styles.filter}>
        <FilterChip
          on={!!filter}
          icon={<FaFilter className={styles.chipIcon} />}
          onToggle={() => setFilter(!filter)}
        >
          {t("filter")}
        </FilterChip>

        {filter && (
          <div className={c(styles.planIdol, filterPop && styles.planIdolIn)}>
            <PlanIdolSelects
              plan={plan}
              idolId={idolId}
              setPlan={setPlan}
              setIdolId={setIdolId}
            />
          </div>
        )}

        {toggleableFilters.map((f) => {
          const enabled = !!enabledCustomFilters[f.label];
          return (
            <FilterChip
              key={f.label}
              on={enabled}
              icon={
                enabled ? (
                  <FaCheck key="on" className={styles.chipIcon} />
                ) : (
                  <FaXmark key="off" className={styles.chipIcon} />
                )
              }
              onToggle={() =>
                setEnabledCustomFilters({
                  ...enabledCustomFilters,
                  [f.label]: !enabled,
                })
              }
            >
              {f.label}
            </FilterChip>
          );
        })}
      </div>
    </>
  );
}

export default memo(EntityBank);
