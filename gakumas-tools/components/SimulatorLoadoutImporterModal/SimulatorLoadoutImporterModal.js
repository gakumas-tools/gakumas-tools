"use client";
import { useCallback, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Stages } from "gakumas-data";
import Modal from "@/components/Modal";
import ScreenshotImporterModal from "@/components/ScreenshotImporterModal";
import importerStyles from "@/components/ScreenshotImporterModal/ScreenshotImporterModal.module.scss";
import StageSummary from "@/components/StageSelect/StageSummary";
import stageStyles from "@/components/StageSelect/StageSelect.module.scss";
import LoadoutContext from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import { getSimulatorLoadoutFromFiles } from "@/utils/imageProcessing/simulatorLoadout";
import styles from "./SimulatorLoadoutImporterModal.module.scss";

// The Idol Road screen can take two: its top, and one scrolled to the
// bottom of the deck.
const MAX_FILES = 2;

function SimulatorLoadoutImporterModal({ stageId, onImport }) {
  const t = useTranslations("SimulatorLoadoutImporterModal");
  const { stage, selectStage, setSupportBonus } = useContext(LoadoutContext);
  const { closeModal } = useContext(ModalContext);
  const [candidates, setCandidates] = useState(null);
  const [idolRoadStage, setIdolRoadStage] = useState(null);

  const importFn = useCallback(
    (files) => getSimulatorLoadoutFromFiles(files, stageId),
    [stageId],
  );

  const handleImport = useCallback(
    ({ stageCandidates, idolRoadStage, ...imported }) => {
      onImport(imported);
      setIdolRoadStage(idolRoadStage ?? null);
      setCandidates(stageCandidates);
    },
    [onImport],
  );

  if (!candidates) {
    return (
      <ScreenshotImporterModal
        translationNamespace="SimulatorLoadoutImporterModal"
        importFn={importFn}
        onSuccess={handleImport}
        maxFiles={MAX_FILES}
      />
    );
  }

  const pick = ({ stageId, supportBonus }) => {
    selectStage(stageId, {});
    // Idol Road stages have no support bonus to infer.
    if (supportBonus != null) setSupportBonus(supportBonus);
    closeModal();
  };

  return (
    <Modal>
      <h3>{t("matchingStages")}</h3>
      <p className={importerStyles.instructions}>
        {candidates.length
          ? t("pickStage")
          : idolRoadStage
            ? t("noIdolRoadStage", { stage: idolRoadStage })
            : t("noStage")}
      </p>
      <div className={stageStyles.stageList}>
        {candidates.map((candidate, i) => (
          <button
            key={candidate.stageId}
            className={c(
              stageStyles.option,
              candidate.stageId == stage?.id && stageStyles.selected,
            )}
            style={{ "--i": i }}
            aria-pressed={candidate.stageId == stage?.id}
            onClick={() => pick(candidate)}
          >
            <StageSummary
              stage={Stages.getById(candidate.stageId)}
              trailing={
                candidate.supportBonus != null && (
                  <span className={styles.supportBonus}>
                    {(candidate.supportBonus * 100).toFixed(2)}%
                  </span>
                )
              }
            />
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default SimulatorLoadoutImporterModal;
