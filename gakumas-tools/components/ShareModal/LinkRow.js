"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FaCheck, FaCopy } from "react-icons/fa6";
import Button from "@/components/Button";
import c from "@/utils/classNames";
import styles from "./ShareModal.module.scss";

export function tweet(url) {
  window.open(
    `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
    "_blank",
  );
}

// A read-only link with its Copy button.
export default function LinkRow({ url }) {
  const t = useTranslations("ShareModal");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copyThisLink"), url);
    }
  }, [url, t]);

  return (
    <div className={styles.urlRow}>
      <input
        type="text"
        className={styles.urlInput}
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <Button size="sm" className={styles.copyBtn} onClick={copy}>
        <span className={c(styles.swap, copied && styles.busy)}>
          <span className={styles.idle}>
            <FaCopy />
            {t("copy")}
          </span>
          <span className={styles.working} aria-hidden={!copied}>
            <FaCheck />
            {t("copied")}
          </span>
        </span>
      </Button>
    </div>
  );
}

