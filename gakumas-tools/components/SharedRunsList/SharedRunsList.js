"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { getStage } from "gakumas-loadout";
import LoadoutSummary from "@/components/LoadoutHistory/LoadoutSummary";
import MiniBoxPlot from "@/components/SimulationRuns/MiniBoxPlot";
import { Link } from "@/i18n/routing";
import {
  computeRange,
  computeTicks,
  normalizeSavedRun,
} from "@/utils/simulationRun";
import { formatStageName } from "@/utils/stages";
import styles from "./SharedRunsList.module.scss";

const hasScores = (run) =>
  Number.isFinite(run.stats?.median) &&
  Number.isFinite(run.stats?.min) &&
  Number.isFinite(run.stats?.max);

const axisProps = ({ range, ticks }) => ({
  xMin: range.min,
  xMax: range.max,
  ticks,
});

// Listed shared runs, each linking to its page. With a stageId they're all
// that stage's, on one score axis so they read against each other; without
// one, each run names its stage and gets its own axis. ranked numbers them.
function SharedRunsList({ runs: listed, stageId = null, ranked = false }) {
  const t = useTranslations("SharedRunsBrowse");
  const tRun = useTranslations("SharedRun");
  const tStage = useTranslations("StageSummary");

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

  return (
    <ol className={styles.runs}>
      {runs.map((run, i) => (
        <li key={run.id} className={styles.run}>
          <Link href={`/s/${run.id}`} className={styles.runLink}>
            {ranked && <span className={styles.rank}>{i + 1}</span>}
            <span className={styles.name}>{run.name || tRun("untitled")}</span>
            {run.sharedBy && (
              <span className={styles.sharedBy}>
                {tRun("sharedBy", { name: run.sharedBy })}
              </span>
            )}
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
              <MiniBoxPlot stats={run.stats} {...axisProps(axisFor(run))} />
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
  );
}

export default memo(SharedRunsList);
