import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { FaChevronDown } from "react-icons/fa6";
import Collapse from "@/components/Collapse";
import CostRanges from "@/components/CostRanges";
import DefaultCards from "@/components/DefaultCards";
import LoadoutOptimizer from "@/components/LoadoutOptimizer";
import c from "@/utils/classNames";
import styles from "./Simulator.module.scss";

function SimulatorSubTools({
  defaultCardIds,
  canCompareParams,
  enterPercents,
}) {
  const t = useTranslations("SimulatorSubTools");
  const [activeSubTool, setActiveSubTool] = useState(null);

  const toggleSubTool = (subTool) => {
    setActiveSubTool(activeSubTool == subTool ? null : subTool);
  };

  return (
    <>
      <div className={styles.expanderButtons}>
        <button
          className={c(activeSubTool === "costRanges" && styles.expanded)}
          onClick={() => toggleSubTool("costRanges")}
          aria-expanded={activeSubTool === "costRanges"}
        >
          {t("costRanges")}
          <FaChevronDown aria-hidden="true" />
        </button>

        <button
          disabled={!defaultCardIds.length}
          className={c(activeSubTool === "defaultCards" && styles.expanded)}
          onClick={() => toggleSubTool("defaultCards")}
          aria-expanded={activeSubTool === "defaultCards"}
        >
          {t("defaultCards")}
          <FaChevronDown aria-hidden="true" />
        </button>

        {canCompareParams && (
          <button
            className={c(activeSubTool === "paramLayouts" && styles.expanded)}
            onClick={() => toggleSubTool("paramLayouts")}
            aria-expanded={activeSubTool === "paramLayouts"}
          >
            {t("paramLayouts")}
            <FaChevronDown aria-hidden="true" />
          </button>
        )}
      </div>

      <Collapse
        open={activeSubTool == "costRanges"}
        className={styles.subTool}
      >
        <CostRanges />
      </Collapse>
      <Collapse
        open={activeSubTool == "defaultCards" && !!defaultCardIds.length}
        className={styles.subTool}
      >
        <DefaultCards skillCardIds={defaultCardIds} />
      </Collapse>
      <Collapse
        open={activeSubTool == "paramLayouts" && canCompareParams}
        className={styles.subTool}
      >
        <LoadoutOptimizer enterPercents={enterPercents} />
      </Collapse>
    </>
  );
}

export default memo(SimulatorSubTools);
