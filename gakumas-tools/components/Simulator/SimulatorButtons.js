"use client";
import { memo, useContext, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  FaCheck,
  FaCircleExclamation,
  FaFileImport,
  FaRegCopy,
  FaRegFloppyDisk,
  FaRegTrashCan,
  FaShareNodes,
} from "react-icons/fa6";
import Button from "@/components/Button";
import ConfirmModal from "@/components/ConfirmModal";
import ModalLoading from "@/components/Modal/ModalLoading";
import LoadoutsModal from "@/components/SimulationRuns/LoadoutsModal";
import ShareModal from "@/components/ShareModal";
import LoadoutContext from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import styles from "./Simulator.module.scss";

const SimulatorLoadoutImporterModal = dynamic(
  () => import("@/components/SimulatorLoadoutImporterModal"),
  { ssr: false, loading: ModalLoading },
);

function SimulatorButtons() {
  const t = useTranslations("SimulatorButtons");

  const { clear, loadout, setLoadout, simulatorUrl } =
    useContext(LoadoutContext);
  const { setModal } = useContext(ModalContext);
  const [copyStatus, setCopyStatus] = useState(null);
  const copiedTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  return (
    <div className={styles.buttons} data-export-hide="true">
      <Button
        style="red-secondary"
        size="sm"
        onClick={() =>
          setModal(
            <ConfirmModal
              message={t("confirm")}
              confirmLabel={t("clear")}
              danger
              onConfirm={clear}
            />,
          )
        }
      >
        <FaRegTrashCan />
        <span className={styles.buttonText}>{t("clear")}</span>
      </Button>

      <Button
        style="blue-secondary"
        size="sm"
        onClick={() => setModal(<LoadoutsModal />)}
      >
        <FaRegFloppyDisk />
        <span className={styles.buttonText}>{t("openLoadouts")}</span>
      </Button>

      <Button
        style="blue-secondary"
        size="sm"
        onClick={() =>
          setModal(
            <SimulatorLoadoutImporterModal
              stageId={loadout.stageId}
              onImport={(imported) => setLoadout({ ...loadout, ...imported })}
            />,
          )
        }
      >
        <FaFileImport />
        <span className={styles.buttonText}>{t("import")}</span>
      </Button>

      {!!simulatorUrl && (
        <>
          <Button
            style="blue-secondary"
            size="sm"
            title={copyStatus === "failed" ? t("copyFailed") : undefined}
            ariaLabel={copyStatus === "failed" ? t("copyFailed") : undefined}
            onClick={async () => {
              let status = "copied";
              try {
                await navigator.clipboard.writeText(simulatorUrl);
              } catch (err) {
                console.error(err);
                status = "failed";
              }
              setCopyStatus(status);
              if (copiedTimerRef.current) {
                clearTimeout(copiedTimerRef.current);
              }
              copiedTimerRef.current = setTimeout(
                () => setCopyStatus(null),
                3000,
              );
            }}
          >
            {copyStatus === "copied" ? (
              <FaCheck className={styles.copied} />
            ) : copyStatus === "failed" ? (
              <FaCircleExclamation className={styles.copyFailed} />
            ) : (
              <FaRegCopy />
            )}
            <span className={styles.buttonText}>URL</span>
          </Button>
          <Button
            style="blue-secondary"
            size="sm"
            onClick={() => setModal(<ShareModal url={simulatorUrl} />)}
          >
            <FaShareNodes />
            <span className={styles.buttonText}>{t("share")}</span>
          </Button>
        </>
      )}
    </div>
  );
}

export default memo(SimulatorButtons);
