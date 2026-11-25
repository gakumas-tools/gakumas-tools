"use client";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import Loader from "@/components/Loader";
import Modal from "@/components/Modal";
import styles from "./ScreenshotImporterModal.module.scss";

// importFn takes the chosen file, or with maxFiles > 1 an array of up to
// maxFiles of them.
function ScreenshotImporterModal({
  translationNamespace,
  importFn,
  onSuccess,
  maxFiles = 1,
}) {
  const t = useTranslations(translationNamespace);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    async (e) => {
      const files = [...e.target.files].slice(0, maxFiles);
      // Clear the input so choosing the same file again (to retry) fires
      // another change.
      e.target.value = "";
      if (!files.length) return;
      setLoading(true);
      setError(null);
      try {
        const result = await importFn(maxFiles > 1 ? files : files[0]);
        onSuccess(result);
      } catch (err) {
        console.error(err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    },
    [importFn, onSuccess, maxFiles],
  );

  return (
    // Closing mid-import would let the result land on whatever is open next.
    <Modal dismissable={!loading}>
      <h3>{t("title")}</h3>
      <p className={styles.instructions}>{t("instructions")}</p>

      <input
        className={styles.file}
        type="file"
        accept="image/*"
        multiple={maxFiles > 1}
        onChange={handleFile}
        disabled={loading}
      />

      <div className={styles.feedback} aria-live="polite">
        {loading && (
          <div className={styles.status}>
            <Loader />
            {t("processing")}
          </div>
        )}
        {error && (
          <div className={styles.error}>
            {t("error")}: {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ScreenshotImporterModal;
