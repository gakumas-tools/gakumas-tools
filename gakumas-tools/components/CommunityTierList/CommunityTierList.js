"use client";
import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FaChevronDown, FaPlus } from "react-icons/fa6";
import Button from "@/components/Button";
import EntityIcon from "@/components/EntityIcon";
import Image from "@/components/Image";
import c from "@/utils/classNames";
import { encodeList } from "@/utils/tierList";
import styles from "./CommunityTierList.module.scss";

// The tier list players published for this type, combined: each item in the
// tier most lists give it, with the spread when lists disagree. Closed until
// opened, so it costs nothing unless someone looks.
function CommunityTierList({ type, onAddYours, refresh }) {
  const t = useTranslations("CommunityTierList");
  const [open, setOpen] = useState(false);
  const [byType, setByType] = useState({});
  const [failed, setFailed] = useState(false);

  const view = byType[type];

  // The player may have just added or taken out their list: load it again.
  useEffect(() => {
    if (refresh) setByType({});
  }, [refresh]);

  useEffect(() => {
    if (!open || view) return;
    let cancelled = false;
    setFailed(false);
    fetch(`/api/community-tier-list?type=${type}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`GET /api/community-tier-list failed with ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setByType((cur) => ({ ...cur, [type]: data }));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, type, view]);

  let body;
  if (failed) body = <div className={styles.note}>{t("failed")}</div>;
  else if (!view) body = <div className={styles.note}>{t("loading")}</div>;
  else if (!view.list) {
    body = (
      <div className={styles.note}>
        {t("tooFew", { count: view.lists, min: 3 })}
      </div>
    );
  } else {
    body = (
      <>
        <div className={styles.summary}>
          <span>{t("fromLists", { count: view.lists })}</span>
          {/* A plain link reloads the editor with this list, so a player's
              own saved list can be compared with it. */}
          <a
            className={styles.useLink}
            href={`?d=${encodeURIComponent(encodeList(view.list))}`}
          >
            {t("openInEditor")}
          </a>
        </div>
        <div className={styles.tiers}>
          {view.list.tiers.map((rank) => (
            <div key={rank} className={styles.row}>
              <div className={styles.label}>
                <Image
                  src={`/ranks/${rank}.png`}
                  alt={rank}
                  width={40}
                  height={40}
                  draggable={false}
                />
              </div>
              <div className={styles.items}>
                {view.list.items[rank].map((id) => {
                  const s = view.byId[id];
                  const spread =
                    s.low != s.high ? `${s.low}–${s.high}` : null;
                  return (
                    <div
                      key={id}
                      className={styles.item}
                      title={t("itemTitle", { n: s.n, lists: view.lists })}
                    >
                      <div className={styles.icon}>
                        <EntityIcon type={type} id={id} size="fill" />
                      </div>
                      <span className={c(styles.spread, !spread && styles.agreed)}>
                        {spread || s.median}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.hint}>{t("howToRead")}</div>
      </>
    );
  }

  return (
    <section className={styles.communityTierList}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{t("title")}</span>
        <FaChevronDown className={c(styles.chevron, open && styles.open)} />
      </button>
      {open && (
        <div className={styles.body}>
          {body}
          <div className={styles.hint}>{t("howToPublish")}</div>
          {onAddYours && (
            <div className={styles.addYours}>
              <Button style="primary" size="sm" onClick={onAddYours}>
                <FaPlus /> {t("addYours")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(CommunityTierList);
