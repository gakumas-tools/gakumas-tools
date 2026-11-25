"use client";
import { memo, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { signIn, useSession } from "next-auth/react";
import Button from "@/components/Button";
import { normalizeTierList } from "@/utils/communityTierLists";
import styles from "./CommunityTierList.module.scss";

// Adds the list being edited to the community tier list, only when its
// player chooses to. One list per player and type: adding again replaces it.
function CommunityPublish({ type }) {
  const t = useTranslations("CommunityTierList");
  const { status } = useSession();
  const [published, setPublished] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    // As it would be kept, so it can be told apart from the published one.
    const d = new URLSearchParams(window.location.search).get("d");
    setCurrent(normalizeTierList(d) || "");
  }, []);

  useEffect(() => {
    if (status != "authenticated") return;
    let cancelled = false;
    fetch(`/api/community-tier-list?type=${type}&mine=1`)
      .then((res) => (res.ok ? res.json() : { list: null }))
      .then((data) => {
        if (!cancelled) setPublished(data.list);
      })
      .catch(() => {
        if (!cancelled) setPublished(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, type]);

  const send = useCallback(
    async (method, body) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/community-tier-list", {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok && res.status != 404) throw new Error(`HTTP ${res.status}`);
        setPublished(method == "PUT" ? (await res.json()).list : null);
      } catch (e) {
        console.error(e);
        setError(t("publishFailed"));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  let content;
  if (status == "loading") {
    content = null;
  } else if (status != "authenticated") {
    content = (
      <>
        <p className={styles.hint}>{t("signInToPublish")}</p>
        <Button fill onClick={() => signIn("discord")}>
          {t("signIn")}
        </Button>
      </>
    );
  } else if (published === undefined) {
    content = <p className={styles.hint}>{t("loading")}</p>;
  } else {
    content = (
      <>
        <p className={styles.hint}>
          {published
            ? published == current
              ? t("publishedThis")
              : t("publishedOther")
            : t("publishHelp")}
        </p>
        {current && published != current && (
          <Button
            style="primary"
            fill
            disabled={busy}
            onClick={() => send("PUT", { type, list: current })}
          >
            {published ? t("replacePublished") : t("publish")}
          </Button>
        )}
        {published && (
          <Button fill disabled={busy} onClick={() => send("DELETE", { type })}>
            {t("unpublish")}
          </Button>
        )}
        {!current && !published && (
          <p className={styles.hint}>{t("emptyList")}</p>
        )}
      </>
    );
  }

  return (
    <div className={styles.publish}>
      <h4>{t("publishTitle")}</h4>
      {content}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

export default memo(CommunityPublish);
