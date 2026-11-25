"use client";
import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FaCircleExclamation,
  FaDownload,
  FaShareNodes,
  FaXTwitter,
} from "react-icons/fa6";
import Button from "@/components/Button";
import Loader from "@/components/Loader";
import Modal from "@/components/Modal";
import ModalContext from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import { exportImage } from "@/utils/exportImage";
import LinkRow, { tweet } from "./LinkRow";
import ResultShare from "./ResultShare";
import styles from "./ShareModal.module.scss";

// The simulator's one Share: the loadout's link, and, when a result is on
// screen, a link to the result that can also be listed on the stage.
export default function ShareModal({ url, result }) {
  const t = useTranslations("ShareModal");
  const { closeModal } = useContext(ModalContext);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const canWebShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function webShare() {
    try {
      await navigator.share({ url, title: "Gakumas Tools" });
      closeModal();
    } catch {
      // User cancelled or share failed; stay open.
    }
  }

  async function saveImage() {
    setExporting(true);
    setError(null);
    let timeoutId;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Export timed out")),
          30000,
        );
      });
      await Promise.race([exportImage(), timeout]);
      closeModal();
    } catch (err) {
      console.error(err);
      setError(t("exportFailed"));
    } finally {
      clearTimeout(timeoutId);
      setExporting(false);
    }
  }

  return (
    <Modal dismissable={!exporting} size="small">
      <h3>{t("title")}</h3>
      <p className={styles.help}>{t("loadoutHelp")}</p>
      <LinkRow url={url} />
      <div className={styles.actions}>
        <Button
          style={result ? "default" : "primary"}
          fill
          onClick={exporting ? undefined : saveImage}
        >
          <span className={c(styles.swap, exporting && styles.busy)}>
            <span className={styles.idle} aria-hidden={exporting}>
              {error ? <FaCircleExclamation /> : <FaDownload />}
              {error || t("saveImage")}
            </span>
            <span className={styles.working} aria-hidden={!exporting}>
              <Loader />
              {t("exporting")}
            </span>
          </span>
        </Button>
        <Button style="default" fill onClick={() => tweet(url)}>
          <FaXTwitter />
          {t("x")}
        </Button>
        {canWebShare && (
          <Button style="default" fill onClick={webShare}>
            <FaShareNodes />
            {t("more")}
          </Button>
        )}
      </div>
      {result && <ResultShare {...result} />}
    </Modal>
  );
}
