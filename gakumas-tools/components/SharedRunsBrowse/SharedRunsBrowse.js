"use client";
import { memo } from "react";
import { useTranslations } from "next-intl";
import { FaShareNodes } from "react-icons/fa6";
import { getStage } from "gakumas-loadout";
import SharedRunsList from "@/components/SharedRunsList";
import { Link, useRouter } from "@/i18n/routing";
import c from "@/utils/classNames";
import { formatStageName } from "@/utils/stages";
import styles from "./SharedRunsBrowse.module.scss";

function pageQuery({ stageId = null, sort = "new", after = null }) {
  const query = {};
  if (stageId != null) query.stage = String(stageId);
  if (stageId != null && sort == "top") query.sort = "top";
  if (after) query.after = after;
  return query;
}

// The runs players listed on their stages, newest first. Picking a stage
// shows only its runs, on one score axis so they read against each other,
// and can rank them by the score the server simulated.
function SharedRunsBrowse({ stages, stageId, sort, runs, next, paged }) {
  const t = useTranslations("SharedRunsBrowse");
  const tStage = useTranslations("StageSummary");
  const router = useRouter();

  const stageName = (id) => formatStageName(getStage(id), tStage);

  function pickStage(e) {
    const value = e.target.value;
    router.push({
      pathname: "/shared",
      query: pageQuery({ stageId: value ? Number(value) : null, sort }),
    });
  }

  return (
    <div className={styles.browse}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.hint}>{t("hint")}</p>
        <label className={styles.stagePicker}>
          {t("stage")}
          <select value={stageId ?? ""} onChange={pickStage}>
            <option value="">{t("allStages")}</option>
            {stageId != null &&
              !stages.some((stage) => stage.stageId === stageId) && (
                <option value={stageId}>{stageName(stageId)}</option>
              )}
            {stages.map((stage) => (
              <option key={stage.stageId} value={stage.stageId}>
                {t("stageOption", {
                  name: stageName(stage.stageId),
                  count: stage.count,
                })}
              </option>
            ))}
          </select>
        </label>
        {stageId != null && (
          <div className={styles.sorts}>
            {["new", "top"].map((key) => (
              <Link
                key={key}
                href={{ pathname: "/shared", query: pageQuery({ stageId, sort: key }) }}
                className={c(styles.sort, sort == key && styles.active)}
                aria-current={sort == key ? "page" : undefined}
              >
                {t(`sort.${key}`)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {runs.length ? (
        <SharedRunsList runs={runs} stageId={stageId} ranked={sort == "top"} />
      ) : (
        <div className={styles.empty}>
          <p>{t("empty")}</p>
          <Link href="/simulator" className={styles.emptyAction}>
            <FaShareNodes />
            {t("emptyAction")}
          </Link>
        </div>
      )}

      <div className={styles.pages}>
        {paged && (
          <Link href={{ pathname: "/shared", query: pageQuery({ stageId }) }}>
            {t("newest")}
          </Link>
        )}
        {next && (
          <Link
            href={{
              pathname: "/shared",
              query: pageQuery({ stageId, after: next }),
            }}
          >
            {t("older")}
          </Link>
        )}
      </div>
    </div>
  );
}

export default memo(SharedRunsBrowse);
