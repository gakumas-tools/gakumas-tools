import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaChevronLeft } from "react-icons/fa6";
import Button from "@/components/Button";
import Image from "@/components/Image";
import { Link } from "@/i18n/routing";
import { generateMetadataForStage } from "@/utils/metadata";
import { getReferenceStage, stageTurns } from "@/utils/stageReference";
import { formatStageName } from "@/utils/stages";
import CriteriaBar from "../CriteriaBar";
import styles from "../page.module.scss";

const PARAMS = ["vocal", "dance", "visual"];
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
  const { counts, total } = stageTurns(stage);
  const idolRoad = stage.type == "idolRoad";

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

      <div className={styles.links}>
        <Button style="primary" href={`/simulator?stage=${stage.id}`}>
          {t("openSimulator")}
        </Button>
        <Button href={`/shared?stage=${stage.id}&sort=top`}>
          {t("sharedRuns")}
        </Button>
      </div>
    </article>
  );
}
