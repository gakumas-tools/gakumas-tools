"use client";
import { memo, useContext, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { FaCodeCompare, FaPlay, FaRegFloppyDisk } from "react-icons/fa6";
import { getStage } from "gakumas-loadout";
import Button from "@/components/Button";
import ConfirmModal from "@/components/ConfirmModal";
import LoadoutSummary from "@/components/LoadoutHistory/LoadoutSummary";
import MiniBoxPlot from "@/components/SimulationRuns/MiniBoxPlot";
import { LoadoutActionsContext } from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import { Link, useRouter } from "@/i18n/routing";
import {
  computeRange,
  computeTicks,
  normalizeSavedRun,
} from "@/utils/simulationRun";
import { isListableStageId } from "@/utils/stageListing";
import { formatStageName } from "@/utils/stages";
import styles from "./SharedRun.module.scss";

const LINK_PHASES = ["OP", "MID", "ED"];
const STATS = ["mean", "median", "min", "max", "stddev"];

// A run someone shared: what they ran, what it scored, and a way to run it
// against your own or keep it.
function SharedRun({ run: shared }) {
  const t = useTranslations("SharedRun");
  const tStage = useTranslations("StageSummary");
  const router = useRouter();
  const { status } = useSession();
  const { setModal } = useContext(ModalContext);
  const { addToHistory, loadRun, saveRun } = useContext(SimulationRunsContext);
  const { selectStage } = useContext(LoadoutActionsContext);
  const [saveState, setSaveState] = useState(null);

  const run = useMemo(() => normalizeSavedRun(shared), [shared]);
  const { loadout, stats } = run;
  const stage = useMemo(
    () => getStage(loadout.stageId, loadout.customStage),
    [loadout],
  );
  const range = useMemo(() => computeRange([run]), [run]);
  const ticks = useMemo(() => computeTicks(range.min, range.max), [range]);

  // Into the history, so the simulator's Compare tab shows it beside your
  // own runs, and into the simulator to run it again.
  function openInSimulator() {
    loadRun(addToHistory(run));
    router.push("/simulator");
  }

  // Into the history only: your own cards stay in the simulator, moved to
  // this run's stage so the two scores mean the same thing, and its Compare
  // tab (chosen for you, filtered to this stage) shows your next result
  // beside this run.
  function compareWithMine() {
    addToHistory(run);
    selectStage(loadout.stageId, loadout.customStage);
    try {
      localStorage.setItem("simulatorResultTab", "compare");
      localStorage.setItem(
        "gakumas-tools.compare.stageFilter",
        JSON.stringify(String(loadout.stageId)),
      );
      localStorage.setItem(
        "gakumas-tools.compare.seasonFilter",
        JSON.stringify("all"),
      );
      localStorage.setItem(
        "gakumas-tools.compare.idolFilter",
        JSON.stringify("all"),
      );
      localStorage.setItem(
        "gakumas-tools.compare.subTab",
        JSON.stringify("history"),
      );
    } catch {
      // Storage blocked: the run is still in the history.
    }
    router.push("/simulator");
  }

  async function save() {
    if (status !== "authenticated") {
      setModal(
        <ConfirmModal
          message={t("signInPrompt")}
          onConfirm={() => signIn("discord")}
        />,
      );
      return;
    }
    setSaveState("saving");
    try {
      await saveRun(run, run.name || formatStageName(stage, tStage));
      setSaveState("saved");
    } catch (err) {
      console.error(err);
      setSaveState("failed");
    }
  }

  return (
    <div className={styles.sharedRun}>
      <div className={styles.header}>
        <h2 className={styles.name}>{run.name || t("untitled")}</h2>
        <div className={styles.stage}>{formatStageName(stage, tStage)}</div>
        {run.sharedBy && (
          <div className={styles.stage}>
            {t("sharedBy", { name: run.sharedBy })}
          </div>
        )}
      </div>

      {stats ? (
        <div className={styles.stats}>
          <MiniBoxPlot
            stats={stats}
            xMin={range.min}
            xMax={range.max}
            ticks={ticks}
            highlight
          />
          <dl className={styles.numbers}>
            {STATS.filter((key) => stats[key] != null).map((key) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{Math.round(stats[key]).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className={styles.noScores}>{t("noScores")}</div>
      )}

      <div className={styles.loadout}>
        {run.linkLoadouts?.length ? (
          run.linkLoadouts.map((linkLoadout, i) => (
            <div key={i}>
              <div className={styles.phase}>
                {LINK_PHASES[i] || `#${i + 1}`}
              </div>
              <LoadoutSummary loadout={linkLoadout} showStage={i === 0} />
            </div>
          ))
        ) : (
          <LoadoutSummary loadout={loadout} />
        )}
      </div>

      <div className={styles.buttons}>
        <Button style="primary" onClick={openInSimulator}>
          <FaPlay /> {t("openInSimulator")}
        </Button>
        <Button onClick={compareWithMine}>
          <FaCodeCompare /> {t("compareWithMine")}
        </Button>
        <Button
          onClick={save}
          disabled={saveState === "saving" || saveState === "saved"}
        >
          <FaRegFloppyDisk />{" "}
          {saveState === "saved" ? t("saved") : t("saveToMyRuns")}
        </Button>
      </div>
      {saveState === "failed" && (
        <div className={styles.error} role="alert">
          {t("saveFailed")}
        </div>
      )}
      <p className={styles.hint}>{t("hint")}</p>
      {isListableStageId(loadout.stageId) && (
        <Link
          className={styles.stageLink}
          href={{
            pathname: "/shared",
            query: { stage: String(loadout.stageId) },
          }}
        >
          {t("moreForStage")}
        </Link>
      )}
    </div>
  );
}

export default memo(SharedRun);
