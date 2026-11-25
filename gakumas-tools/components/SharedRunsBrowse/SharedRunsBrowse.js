"use client";
import { memo } from "react";
import { useTranslations } from "next-intl";
import { FaShareNodes } from "react-icons/fa6";
import { getStage } from "gakumas-loadout";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import Select from "@/components/Select";
import SharedRunsList from "@/components/SharedRunsList";
import { useRouter } from "@/i18n/routing";
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

  const stageOptions = [
    { value: "", label: t("allStages") },
    ...(stageId != null && !stages.some((stage) => stage.stageId === stageId)
      ? [{ value: stageId, label: stageName(stageId) }]
      : []),
    ...stages.map((stage) => ({
      value: stage.stageId,
      label: t("stageOption", {
        name: stageName(stage.stageId),
        count: stage.count,
      }),
    })),
  ];

  function pickStage(value) {
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
          <Select
            value={stageId ?? ""}
            options={stageOptions}
            onChange={pickStage}
            size="sm"
          />
        </label>
        {stageId != null && (
          <ButtonGroup
            className={styles.sorts}
            selected={sort}
            options={["new", "top"].map((key) => ({
              value: key,
              label: t(`sort.${key}`),
              href: { pathname: "/shared", query: pageQuery({ stageId, sort: key }) },
            }))}
          />
        )}
      </div>

      {runs.length ? (
        <SharedRunsList runs={runs} stageId={stageId} ranked={sort == "top"} />
      ) : (
        <div className={styles.empty}>
          <p>{t("empty")}</p>
          <Button href="/simulator" style="primary" size="sm">
            <FaShareNodes />
            {t("emptyAction")}
          </Button>
        </div>
      )}

      <div className={styles.pages}>
        {paged && (
          <Button
            size="sm"
            href={{ pathname: "/shared", query: pageQuery({ stageId }) }}
          >
            {t("newest")}
          </Button>
        )}
        {next && (
          <Button
            size="sm"
            className={styles.older}
            href={{
              pathname: "/shared",
              query: pageQuery({ stageId, after: next }),
            }}
          >
            {t("older")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(SharedRunsBrowse);
