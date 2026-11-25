import { memo, useContext, useEffect, useMemo, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { HIDDEN_P_IDOL_IDS, PIdols } from "gakumas-data";
import Collapse from "@/components/Collapse";
import PlanIdolSelects from "@/components/PlanIdolSelects";
import PIdol from "@/components/PIdol";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import c from "@/utils/classNames";
import styles from "./PIdolSelect.module.scss";

function PIdolSelect({ selected, onChange }) {
  const { plan, setPlan, idolId, setIdolId } = useContext(WorkspaceContext);
  const [expanded, setExpanded] = useState(!selected);

  useEffect(() => {
    if (!selected || !expanded) return;
    const pIdol = PIdols.getById(selected);
    setPlan(pIdol.plan);
    setIdolId(pIdol.idolId);
  }, [expanded, selected]);

  const pIdols = useMemo(
    () =>
      PIdols.getFiltered({ plans: [plan], idolIds: [idolId] }).filter(
        (pIdol) => !HIDDEN_P_IDOL_IDS.has(pIdol.id),
      ),
    [plan, idolId]
  );

  return (
    <div className={styles.pIdolSelect}>
      <button
        type="button"
        className={c(
          styles.pIdol,
          !selected && styles.empty,
          expanded && styles.expanded
        )}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <PIdol pIdolId={selected} />
        <span className={styles.caret} aria-hidden="true">
          <FaChevronDown />
        </span>
      </button>

      <div className={styles.expanderSlot}>
        <Collapse open={expanded} className={styles.expander}>
          <PlanIdolSelects
            plan={plan}
            idolId={idolId}
            setPlan={setPlan}
            setIdolId={setIdolId}
          />

          <div className={styles.result}>
            {pIdols.map((pIdol, i) => (
              <button
                key={pIdol.id}
                type="button"
                className={c(
                  styles.pIdolButton,
                  pIdol.id == selected && styles.selected
                )}
                style={{ "--i": i }}
                onClick={() => {
                  onChange(pIdol.id);
                  setExpanded(false);
                }}
                aria-pressed={pIdol.id == selected}
              >
                <PIdol pIdolId={pIdol.id} />
              </button>
            ))}
          </div>
        </Collapse>
      </div>
    </div>
  );
}

export default memo(PIdolSelect);
