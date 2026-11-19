"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { getStage } from "gakumas-loadout";
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

function stageQuery(stageId, before) {
  const query = {};
  if (stageId != null) query.stage = String(stageId);
  if (before) query.before = before;
  return query;
}

// Everyone's shared runs, newest first. Picking a stage shows only its
// runs, all on one score axis, so they can be read against each other.
function SharedRunsBrowse({ stages, stageId, runs: shared, next, paged }) {
  const t = useTranslations("SharedRunsBrowse");
  const tRun = useTranslations("SharedRun");
  const tStage = useTranslations("StageSummary");
  const router = useRouter();

  const runs = useMemo(() => shared.map(normalizeSavedRun), [shared]);
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

  function pickStage(e) {
    const value = e.target.value;
    router.push({
      pathname: "/shared",
      query: stageQuery(value ? Number(value) : null),
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
      </div>

      {runs.length ? (
        <ol className={styles.runs}>
          {runs.map((run) => (
            <li key={run.id} className={styles.run}>
              <Link href={`/s/${run.id}`} className={styles.runLink}>
                <span className={styles.name}>
                  {run.name || tRun("untitled")}
                </span>
                {stageId == null && (
                  <span className={styles.stage}>
                    {formatStageName(
                      getStage(run.loadout.stageId, run.loadout.customStage),
                      tStage,
                    )}
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
                    {t("median", {
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
        <p className={styles.empty}>{t("empty")}</p>
      )}

      <div className={styles.pages}>
        {paged && (
          <Link href={{ pathname: "/shared", query: stageQuery(stageId) }}>
            {t("newest")}
          </Link>
        )}
        {next && (
          <Link
            href={{ pathname: "/shared", query: stageQuery(stageId, next) }}
          >
            {t("older")}
          </Link>
        )}
      </div>
    </div>
  );
}

export default memo(SharedRunsBrowse);
