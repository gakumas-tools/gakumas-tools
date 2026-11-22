"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { FaShareNodes } from "react-icons/fa6";
import { getStage } from "gakumas-loadout";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import Select from "@/components/Select";
import LoadoutSummary from "@/components/LoadoutHistory/LoadoutSummary";
import MiniBoxPlot from "@/components/SimulationRuns/MiniBoxPlot";
import { Link, useRouter } from "@/i18n/routing";
import {
  computeRange,
  computeTicks,
  normalizeSavedRun,
} from "@/utils/simulationRun";
import { formatStageName } from "@/utils/stages";
import styles from "./SharedRunsBrowse.module.scss";

const hasScores = (run) =>
  Number.isFinite(run.stats?.median) &&
  Number.isFinite(run.stats?.min) &&
  Number.isFinite(run.stats?.max);

const axisProps = ({ range, ticks }) => ({
  xMin: range.min,
  xMax: range.max,
  ticks,
});

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
function SharedRunsBrowse({ stages, stageId, sort, runs: listed, next, paged }) {
  const t = useTranslations("SharedRunsBrowse");
  const tRun = useTranslations("SharedRun");
  const tStage = useTranslations("StageSummary");
  const router = useRouter();

  // normalizeSavedRun keeps a saved run's fields; how many opened it rides along.
  const runs = useMemo(
    () =>
      listed.map((run) => ({
        ...normalizeSavedRun(run),
        openedBy: run.openedBy ?? 0,
        openedByMore: !!run.openedByMore,
      })),
    [listed],
  );
  // One axis for one stage; across stages the scores aren't comparable, so
  // each run gets its own.
  const stageAxis = useMemo(() => {
    if (stageId == null) return null;
    const range = computeRange(runs.filter(hasScores));
    return { range, ticks: computeTicks(range.min, range.max) };
  }, [runs, stageId]);
  function axisFor(run) {
    if (stageAxis) return stageAxis;
    const range = computeRange([run]);
    return { range, ticks: computeTicks(range.min, range.max) };
  }

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
        <ol className={styles.runs}>
          {runs.map((run, i) => (
            <li key={run.id} className={styles.run}>
              <Link href={`/s/${run.id}`} className={styles.runLink}>
                {sort == "top" && <span className={styles.rank}>{i + 1}</span>}
                <span className={styles.name}>
                  {run.name || tRun("untitled")}
                </span>
                {stageId == null && (
                  <span className={styles.stage}>
                    {stageName(run.loadout.stageId)}
                  </span>
                )}
                {run.openedBy > 0 && (
                  <span className={styles.opened}>
                    {tRun(run.openedByMore ? "openedByMore" : "openedBy", {
                      count: run.openedBy,
                    })}
                  </span>
                )}
              </Link>
              {hasScores(run) ? (
                <div className={styles.stats}>
                  <MiniBoxPlot
                    stats={run.stats}
                    {...axisProps(axisFor(run))}
                  />
                  <span className={styles.median}>
                    {t("scores", {
                      mean: Math.round(run.stats.mean).toLocaleString(),
                      median: Math.round(run.stats.median).toLocaleString(),
                    })}
                  </span>
                </div>
              ) : (
                <div className={styles.noScores}>{tRun("noScores")}</div>
              )}
              <LoadoutSummary
                loadout={run.linkLoadouts?.[0] ?? run.loadout}
                showStage={false}
              />
            </li>
          ))}
        </ol>
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
