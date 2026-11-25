import { memo } from "react";
import { HIDDEN_P_IDOL_IDS, Idols, PIdols } from "gakumas-data";
import gkImg from "gakumas-images";
import IconSelect from "@/components/IconSelect";
import { PLANS } from "@/utils/plans";
import styles from "./PlanIdolSelects.module.scss";

const plans = PLANS.map((alias) => ({
  id: alias,
  iconSrc: `/plans/${alias}.png`,
  alt: alias,
}));

// Idols with no P-idol to pick (all hidden) are left out.
const idols = Idols.getAll()
  .filter((idol) =>
    PIdols.getFiltered({ idolIds: [idol.id] }).some(
      (pIdol) => !HIDDEN_P_IDOL_IDS.has(pIdol.id),
    ),
  )
  .map((idol) => ({
    id: idol.id,
    iconSrc: gkImg(idol).icon,
    alt: idol.name,
  }));

function PlanIdolSelects({ plan, idolId, setPlan, setIdolId, includeAll }) {
  return (
    <div className={styles.selects}>
      <IconSelect
        options={plans}
        selected={plan}
        onChange={setPlan}
        includeAll={includeAll}
        collapsable
      />
      <IconSelect
        options={idols}
        selected={idolId}
        onChange={setIdolId}
        includeAll={includeAll}
        collapsable
      />
    </div>
  );
}

export default memo(PlanIdolSelects);
