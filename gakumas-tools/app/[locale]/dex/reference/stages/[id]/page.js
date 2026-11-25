import { IdolRoad } from "gakumas-data";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaChevronLeft } from "react-icons/fa6";
import Button from "@/components/Button";
import Image from "@/components/Image";
import SharedRunsList from "@/components/SharedRunsList";
import { Link } from "@/i18n/routing";
import { generateMetadataForStage } from "@/utils/metadata";
import { connect } from "@/utils/mongodb";
import { withOpeners } from "@/utils/shareOpens";
import { listStageRuns } from "@/utils/sharedRuns";
import { getReferenceStage, stageTurns } from "@/utils/stageReference";
import { formatStageName } from "@/utils/stages";
import CriteriaBar from "../CriteriaBar";
import styles from "../page.module.scss";

const PARAMS = ["vocal", "dance", "visual"];
// How many of the stage's best shared runs its page shows.
const TOP_RUNS = 3;

// The stage's best listed runs, as /shared?stage=<id>&sort=top ranks them.
// The page still renders without them if the database can't be reached.
async function topRuns(stageId) {
  try {
    const { db } = await connect();
    const runs = await withOpeners(db, await listStageRuns(db, stageId, TOP_RUNS));
    return runs.map((run) => ({
      ...run,
      createdAt: run.createdAt?.toISOString?.() ?? null,
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

const percent = (v) => `${Math.round((Number(v) || 0) * 1000) / 10}%`;

export async function generateMetadata({ params }) {
  const { locale, id } = await params;
  const stage = getReferenceStage(id);
  if (!stage) notFound();
  return await generateMetadataForStage(stage, locale);
}

export default async function StagePage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const stage = getReferenceStage(id);
  if (!stage) notFound();

  const t = await getTranslations({ locale, namespace: "StagePage" });
  const tStage = await getTranslations({ locale, namespace: "StageSummary" });
  const tType = await getTranslations({ locale, namespace: "StageSelectModal" });
  const tDex = await getTranslations({ locale, namespace: "Dex" });
  const tPage = await getTranslations({ locale, namespace: "EntityPage" });
  const tEffect = await getTranslations({ locale, namespace: "stage" });
  const { counts, total } = stageTurns(stage);
  const idolRoad = stage.type == "idolRoad";
  const runs = await topRuns(Number(stage.id));
  // The 応援/トラブル lines stay in the game's own wording in every locale.
  const stageTexts = idolRoad ? IdolRoad.getStageTexts(Number(stage.id)) : [];

  return (
    <article className={styles.page}>
      <Link className={styles.back} href="/dex/reference/stages">
        <FaChevronLeft aria-hidden="true" />
        {tPage("back", { category: tDex("tabs.stages") })}
      </Link>

      <header className={styles.heading}>
        <h1>{formatStageName(stage, tStage)}</h1>
        <div className={styles.tags}>
          <span className={styles.tag}>{tType(stage.type)}</span>
          {!idolRoad && stage.plan && (
            <span className={styles.tag}>
              <Image
                src={`/plans/${stage.plan}.png`}
                alt=""
                width={14}
                height={14}
              />
              {tDex(`plans.${stage.plan}`)}
            </span>
          )}
          {stage.preview && <span className={styles.tag}>{t("preview")}</span>}
        </div>
      </header>

      {idolRoad && <p className={styles.note}>{t("idolRoadNote")}</p>}

      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            {PARAMS.map((p) => (
              <th key={p} className={styles[p]}>
                {t(p)}
              </th>
            ))}
            <th>{t("total")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t("criteria")}</th>
            {PARAMS.map((p) => (
              <td key={p}>{percent(stage.criteria?.[p])}</td>
            ))}
            <td />
          </tr>
          <tr>
            <th scope="row">{t("turns")}</th>
            {counts.map((n, i) => (
              <td key={i}>{n}</td>
            ))}
            <td>{total}</td>
          </tr>
          <tr>
            <th scope="row">{t("firstTurn")}</th>
            {PARAMS.map((p) => (
              <td key={p}>{percent(stage.firstTurns?.[p])}</td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
      <CriteriaBar criteria={stage.criteria} />

      {stageTexts.length > 0 && (
        <section className={styles.section}>
          <h2>{t("stageTexts")}</h2>
          <p className={styles.note}>{t("stageTextsNote")}</p>
          {stageTexts.map(({ recommendedEffect, lines }) => (
            <div key={recommendedEffect} className={styles.branch}>
              <h3>
                {t("recommendedEffect", {
                  effect: tEffect(recommendedEffect),
                })}
              </h3>
              <ul className={`${styles.list} ${styles.effectLines}`}>
                {lines.map((line, i) => (
                  <li key={i} className={styles.effectLine}>
                    <span className={styles.turns}>
                      {t("turnN", { n: line.turn })}
                    </span>
                    {line.kind && (
                      <span className={`${styles.tag} ${styles[line.kind]}`}>
                        {t(line.kind)}
                      </span>
                    )}
                    <span lang="ja" className={styles.effectText}>
                      {line.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className={styles.links}>
        <Button style="primary" href={`/simulator?stage=${stage.id}`}>
          {t("openSimulator")}
        </Button>
        <Button href={`/shared?stage=${stage.id}&sort=top`}>
          {t("sharedRuns")}
        </Button>
      </div>

      <section className={styles.section}>
        <h2>{t("topRuns")}</h2>
        {runs.length ? (
          <SharedRunsList runs={runs} stageId={Number(stage.id)} ranked />
        ) : (
          <p className={styles.note}>{t("noRuns")}</p>
        )}
      </section>
    </article>
  );
}
