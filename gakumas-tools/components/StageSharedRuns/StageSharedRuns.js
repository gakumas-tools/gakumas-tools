"use client";
import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FaChevronDown } from "react-icons/fa6";
import { PIdols, SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import Image from "@/components/Image";
import { Link } from "@/i18n/routing";
import c from "@/utils/classNames";
import { getIdolName } from "@/utils/simulationRun";
import { isListableStageId, placeAmongRuns } from "@/utils/stageListing";
import styles from "./StageSharedRuns.module.scss";

// Runs other players listed for the stage being simulated, best first. Closed
// until opened, so it costs nothing unless someone looks. yourMean is the mean
// of the result on screen, if it's for this loadout: it gets a row of its own
// at the place it would take, so a player sees where they stand.
function StageSharedRuns({ stageId, yourMean }) {
  const t = useTranslations("StageSharedRuns");
  const tDex = useTranslations("Dex");
  const [open, setOpen] = useState(false);
  const [byStage, setByStage] = useState({});
  const [failed, setFailed] = useState(false);

  const runs = byStage[stageId];

  useEffect(() => {
    if (!open || !isListableStageId(stageId) || runs) return;
    let cancelled = false;
    setFailed(false);
    fetch(`/api/share?stage=${stageId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/share failed with ${res.status}`);
        return res.json();
      })
      .then((list) => {
        if (!cancelled) setByStage((cur) => ({ ...cur, [stageId]: list }));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stageId, runs]);

  if (!isListableStageId(stageId)) return null;

  const place = runs && !failed ? placeAmongRuns(runs, yourMean) : null;
  const yourRow = place && (
    <li key="yours" className={styles.yours}>
      <div className={styles.row}>
        <span className={styles.rank} />
        <span className={styles.placeholder} />
        <span className={styles.text}>
          <span className={styles.name}>{t("yourRun")}</span>
          <span className={styles.meta}>
            {place.below
              ? t("belowTop", { count: runs.length })
              : t("place", { rank: place.rank, count: runs.length + 1 })}
          </span>
        </span>
        <span className={styles.score}>
          {Math.round(yourMean).toLocaleString()}
        </span>
      </div>
    </li>
  );

  let body;
  if (failed) body = <div className={styles.note}>{t("failed")}</div>;
  else if (!runs) body = <div className={styles.note}>{t("loading")}</div>;
  else if (!runs.length) {
    body = (
      <>
        <div className={styles.note}>{t("empty")}</div>
        {yourRow && <ol className={styles.list}>{yourRow}</ol>}
      </>
    );
  }
  else {
    body = (
      <ol className={styles.list}>
        {runs.flatMap((run, i) => {
          const card = run.derived?.signatureCardId
            ? SkillCards.getById(run.derived.signatureCardId)
            : null;
          const pIdol = run.derived?.pIdolId
            ? PIdols.getById(run.derived.pIdolId)
            : null;
          const plan = pIdol?.plan || card?.plan;
          const idol = getIdolName(run.derived?.idolId);
          const mean = run.stats?.mean;
          const row = (
            <li key={run.id}>
              <Link href={`/s/${run.id}`} className={styles.row}>
                <span className={styles.rank}>{i + 1}</span>
                {card ? (
                  <Image
                    src={gkImg(card).icon}
                    width={32}
                    height={32}
                    alt={card.name}
                    draggable={false}
                  />
                ) : (
                  <span className={styles.placeholder} />
                )}
                <span className={styles.text}>
                  <span className={styles.name}>
                    {run.name || t("untitled")}
                  </span>
                  <span className={styles.meta}>
                    {[idol, plan && plan != "free" && tDex(`plans.${plan}`)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={styles.score}>
                  {mean == null ? "—" : Math.round(mean).toLocaleString()}
                </span>
              </Link>
            </li>
          );
          return i === place?.index ? [yourRow, row] : [row];
        })}
        {place?.index === runs.length && yourRow}
      </ol>
    );
  }

  return (
    <section className={styles.stageSharedRuns}>
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
          {runs?.length > 0 && (
            <Link
              href={{
                pathname: "/shared",
                query: { stage: String(stageId), sort: "top" },
              }}
              className={styles.seeAll}
            >
              {t("seeAll")}
            </Link>
          )}
          <div className={styles.hint}>{t("howToList")}</div>
        </div>
      )}
    </section>
  );
}

export default memo(StageSharedRuns);
