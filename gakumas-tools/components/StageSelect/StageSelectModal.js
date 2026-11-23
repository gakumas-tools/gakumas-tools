import { useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { IdolRoad, Stages } from "gakumas-data";
import { IdolConfig } from "gakumas-engine";
import ButtonGroup from "@/components/ButtonGroup";
import Modal from "@/components/Modal";
import StageCustomizer from "@/components/StageCustomizer";
import LoadoutContext from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import { compareStages } from "@/utils/sort";
import StageSummary from "./StageSummary";
import styles from "./StageSelect.module.scss";

const allStages = [...Stages.getAll()].sort(compareStages);
const stagesByType = allStages.reduce((acc, stage) => {
  if (!acc[stage.type]) {
    acc[stage.type] = [];
  }
  acc[stage.type].push(stage);
  return acc;
}, {});

export default function StageSelectModal() {
  const t = useTranslations("StageSelectModal");

  const STAGE_TYPE_OPTIONS = [
    { value: "contest", label: t("contest") },
    { value: "linkContest", label: t("linkContest") },
    { value: "event", label: t("event") },
    // Shown once stages.csv has an Idol Road row.
    ...(stagesByType.idolRoad
      ? [{ value: "idolRoad", label: t("idolRoad") }]
      : []),
    { value: "custom", label: t("custom") },
  ];

  const { loadout, selectStage, stage } = useContext(LoadoutContext);
  const { closeModal } = useContext(ModalContext);
  const [stageType, setStageType] = useState(
    stage?.id == "custom" ? "custom" : stage?.type || "contest",
  );

  function setStage(stageId, customStage) {
    selectStage(stageId, customStage);
    closeModal();
  }

  // An Idol Road lists only the stages of the loadout P-idol's road. With
  // no P-idol, or one whose road isn't known yet, every stage is listed.
  const roadStageIds = useMemo(
    () => IdolRoad.getStageIds(new IdolConfig(loadout).pIdolId),
    [loadout],
  );

  let stages = stagesByType[stageType] || [];
  if (stageType == "idolRoad" && roadStageIds) {
    stages = stages.filter((s) => roadStageIds.includes(s.id));
  }

  return (
    <Modal>
      <ButtonGroup
        className={styles.typeSelect}
        selected={stageType}
        options={STAGE_TYPE_OPTIONS}
        onChange={setStageType}
      />
      {stageType == "custom" ? (
        <div className={styles.customizer}>
          <StageCustomizer
            initialStage={stage}
            onApply={(value) => setStage("custom", value)}
          />
        </div>
      ) : (
        <div className={styles.stageList}>
          {stageType == "idolRoad" && !stages.length && (
            <p className={styles.none}>{t("idolRoadNone")}</p>
          )}
          {stages.map((option, i) => (
            <button
              key={option.id}
              className={c(
                styles.option,
                option.id == stage?.id && styles.selected,
              )}
              style={{ "--i": i }}
              value={option.id}
              aria-pressed={option.id == stage?.id}
              onClick={() => setStage(option.id, {})}
            >
              <StageSummary stage={option} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
