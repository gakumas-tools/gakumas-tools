import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { generateMetadataForTool } from "@/utils/metadata";
import { groupedStages, stagePath, stageTurns } from "@/utils/stageReference";
import { formatStageName } from "@/utils/stages";
import CriteriaBar from "./CriteriaBar";
import styles from "./page.module.scss";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return await generateMetadataForTool(
    "dex",
    locale,
    "/dex/reference/stages",
  );
}

export default async function StagesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "StagePage" });
  const tStage = await getTranslations({ locale, namespace: "StageSummary" });
  const tType = await getTranslations({ locale, namespace: "StageSelectModal" });

  return (
    <div className={styles.page}>
      {groupedStages().map(({ type, stages }) => (
        <section key={type} className={styles.section}>
          <h2>{tType(type)}</h2>
          <ul className={styles.list}>
            {stages.map((stage) => (
              <li key={stage.id}>
                <Link href={stagePath(stage.id)} className={styles.row}>
                  <span className={styles.name}>
                    {formatStageName(stage, tStage)}
                  </span>
                  <span className={styles.turns}>
                    {t("turnsTotal", { n: stageTurns(stage).total })}
                  </span>
                  <CriteriaBar criteria={stage.criteria} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
