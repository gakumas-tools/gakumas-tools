"use client";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FaCircleCheck, FaTriangleExclamation } from "react-icons/fa6";
import { useTranslations } from "next-intl";
import { createWorker } from "tesseract.js";
import Image from "@/components/Image";
import Loader from "@/components/Loader";
import Modal from "@/components/Modal";
import ProgressBar from "@/components/ProgressBar";
import FileDropzone from "@/components/Rehearsal/FileDropzone";
import c from "@/utils/classNames";
import { getMemoryFromFile } from "@/utils/imageProcessing/memory";
import {
  loadPItemModel,
  loadSkillCardModel,
} from "@/utils/imageProcessing/models";
import { logEvent } from "@/utils/logging";
import { createOcrPool } from "@/utils/ocrPool";
import styles from "./MemoryImporterModal.module.scss";

const BUSY_STATUSES = ["preparing", "reading", "saving"];

function MemoryImporterModal({ onSuccess, multiple = true }) {
  const t = useTranslations("MemoryImporterModal");

  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [failedFiles, setFailedFiles] = useState([]);
  const ocrPoolRef = useRef(null);
  const busy = BUSY_STATUSES.includes(status);

  useEffect(
    () => () => {
      ocrPoolRef.current?.close();
    },
    []
  );

  const handleFiles = useCallback(
    async (files) => {
      if (!files.length) return;
      setTotal(files.length);
      setProgress(0);
      setFailedFiles([]);
      setStatus("preparing");

      try {
        const [pItemModel, skillCardModel] = await Promise.all([
          loadPItemModel(),
          loadSkillCardModel(),
        ]);
        ocrPoolRef.current ??= createOcrPool(() => createWorker("eng", 1));
        const pool = ocrPoolRef.current;

        console.time("All memories parsed");
        setStatus("reading");
        const parsed = await Promise.all(
          files.map(async (file) => {
            try {
              return await pool.run((engWorker) =>
                getMemoryFromFile(
                  file,
                  engWorker,
                  pItemModel.session,
                  pItemModel.classes,
                  skillCardModel.session,
                  skillCardModel.classes
                )
              );
            } catch (err) {
              console.error(file.name, err);
              return null;
            } finally {
              setProgress((p) => p + 1);
            }
          })
        );
        console.timeEnd("All memories parsed");
        const results = parsed.filter(Boolean);
        const failed = files
          .filter((_, i) => !parsed[i])
          .map((file) => file.name);
        setFailedFiles(failed);
        if (!results.length) throw new Error("No screenshots could be read");

        logEvent("memories.import", {
          num: results.length,
        });

        setStatus("saving");
        if ((await onSuccess(results)) === false) {
          throw new Error("Couldn't save imported memories");
        }
        setStatus("done");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    },
    [onSuccess]
  );

  return (
    <Modal dismissable={!busy}>
      <h3>{t("importMemories")}</h3>
      <div className={styles.help}>
        <Image
          src="/memory_importer_reference.jpg"
          width={178}
          height={360}
          alt=""
        />

        <div>
          {t.rich("instructions", {
            p: (chunks) => <p>{chunks}</p>,
          })}
        </div>
      </div>

      <FileDropzone
        title={t("selectScreenshots")}
        hint={t("dropHint")}
        accept="image/*"
        multiple={multiple}
        disabled={busy}
        onFiles={handleFiles}
      />

      <div
        className={c(
          styles.progress,
          status == "done" && styles.done,
          status == "error" && styles.error
        )}
        aria-live="polite"
      >
        <div key={status} className={styles.status}>
          {busy && <Loader />}
          {status == "done" && <FaCircleCheck />}
          {status == "error" && <FaTriangleExclamation />}
          {status == "preparing" && t("preparing")}
          {(status == "reading" || status == "done") &&
            t("progress", { progress, total })}
          {status == "saving" && t("saving")}
          {status == "error" && t("failed")}
        </div>
        <div className={c(styles.bar, status && styles.barShown)}>
          <ProgressBar value={progress} max={total} />
        </div>
        <div className={styles.failedFiles}>
          {!busy &&
            failedFiles.length > 0 &&
            t("unreadable", { files: failedFiles.join(", ") })}
        </div>
      </div>
    </Modal>
  );
}

export default memo(MemoryImporterModal);
