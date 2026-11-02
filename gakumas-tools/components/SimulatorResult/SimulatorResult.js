import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  FaCheck,
  FaCircleArrowUp,
  FaDownload,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import { Stages } from "gakumas-data";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import useRehearsalParser from "@/components/Rehearsal/useRehearsalParser";
import RehearsalComparison, {
  useComparisonSubmission,
} from "@/components/RehearsalComparison";
import CompareTab from "@/components/SimulationRuns";
import SimulatorLogs from "@/components/SimulatorLogs";
import SimulatorStats from "@/components/SimulatorStats";
import { LoadoutActionsContext } from "@/contexts/LoadoutContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import c from "@/utils/classNames";
import { downloadBlob } from "@/utils/download";
import { logEvent } from "@/utils/logging";
import { canOptimizeParams, findOptimalParams } from "@/utils/paramOptimizer";
import { cellScores } from "@/utils/rehearsalComparison";
import ScoreStats from "./ScoreStats";
import SimulatorResultGraphs from "./SimulatorResultGraphs";
import styles from "./SimulatorResult.module.scss";
import KofiAd from "../KofiAd";

const TABS = ["stats", "logs", "compare", "rehearsal"];
const CONTEST_TABS = new Set(["rehearsal"]);
const TAB_STORAGE_KEY = "simulatorResultTab";
const FEEDBACK_MS = 2200;
const SPARKLE_COUNT = 4;
const SPARKLE_PATH =
  "M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z";

function OptimizeLabel({ feedback }) {
  const t = useTranslations("SimulatorResult");
  const shown = feedback?.visible;

  let text = null;
  if (feedback) {
    text =
      feedback.kind == "gain"
        ? t("optimizeGain", { gain: feedback.gain.toLocaleString() })
        : t(feedback.kind == "optimal" ? "optimizeAlready" : "optimizeFailed");
  }

  return (
    <span className={c(styles.swap, shown && styles.swapped)}>
      <span className={styles.swapIdle} aria-hidden={shown || undefined}>
        <FaWandMagicSparkles />
        {t("optimizeParams")}
      </span>
      <span
        className={c(styles.swapResult, feedback && styles[feedback.kind])}
        aria-hidden="true"
      >
        {feedback && (
          <span key={feedback.key} className={styles.swapContent}>
            {feedback.kind != "failed" && (
              <span className={styles.swapIcon}>
                <FaCheck />
                {feedback.kind == "gain" && (
                  <span className={styles.optSparkles}>
                    {Array.from({ length: SPARKLE_COUNT }, (_, i) => (
                      <svg key={i} viewBox="0 0 24 24">
                        <path d={SPARKLE_PATH} />
                      </svg>
                    ))}
                  </span>
                )}
              </span>
            )}
            {text}
          </span>
        )}
      </span>
      <span className={styles.status} role="status">
        {shown ? text : ""}
      </span>
    </span>
  );
}

function SimulatorResult({
  pending,
  data,
  config,
  enterPercents,
  idolId,
  plan,
}) {
  const t = useTranslations("SimulatorResult");
  const { setParams } = useContext(LoadoutActionsContext);
  const { history } = useContext(SimulationRunsContext);
  const currentRun = history[0] || null;
  // Default rendered during SSR / pre-hydration. Hydrated from localStorage
  // in the effect below so the initial markup matches between server and
  // client (avoids hydration mismatch warnings).
  const [tab, setTabState] = useState("logs");
  const [tabSwitched, setTabSwitched] = useState(false);
  const [optimizeFeedback, setOptimizeFeedback] = useState(null);
  const rehearsalParser = useRehearsalParser();
  const [rehearsalCell, setRehearsalCell] = useState(null);
  const [run, setRun] = useState({ data, config, enterPercents });
  if (run.data !== data) setRun({ data, config, enterPercents });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && TABS.includes(saved)) setTabState(saved);
    } catch {
      // localStorage unavailable (e.g. privacy mode) — just stick with default.
    }
  }, []);

  useEffect(() => {
    if (!optimizeFeedback?.visible) return;
    const timer = setTimeout(
      () => setOptimizeFeedback((cur) => cur && { ...cur, visible: false }),
      FEEDBACK_MS
    );
    return () => clearTimeout(timer);
  }, [optimizeFeedback]);

  const setTab = useCallback((value) => {
    setTabState(value);
    setTabSwitched(true);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, value);
    } catch {
      // storage full / blocked — persistence degrades, tab still works.
    }
    logEvent("simulator_tab_switch", { tab: value });
  }, []);

  const optimizeParams = useCallback(() => {
    const showFeedback = (kind, gain) =>
      setOptimizeFeedback((cur) => ({
        kind,
        gain,
        key: (cur?.key || 0) + 1,
        visible: true,
      }));

    const result = findOptimalParams({
      scoreStats: data.scoreStats,
      config: run.config,
      enterPercents: run.enterPercents,
    });
    if (!result) {
      showFeedback("failed");
      return;
    }

    const { vocal, dance, visual } = result.params;
    const current = config.idol.params;
    const changed =
      vocal != current.vocal ||
      dance != current.dance ||
      visual != current.visual;

    if (changed) {
      setParams((cur) => [vocal, dance, visual, cur[3]]);
      const gain = Math.max(
        Math.round(
          (result.optimalScore - result.baseScore) / data.scoreStats.numRuns
        ),
        0
      );
      showFeedback("gain", gain);
    } else {
      showFeedback("optimal");
    }
    logEvent("simulator_params_optimize", {
      gain: Math.round(result.optimalScore - result.baseScore),
    });
  }, [data.scoreStats, run, config, setParams]);

  const isContest =
    Stages.getById(currentRun?.loadout?.stageId)?.type == "contest";
  const tabs = isContest ? TABS : TABS.filter((v) => !CONTEST_TABS.has(v));
  const shownTab = tabs.includes(tab) ? tab : "logs";
  const rehearsalScores = useMemo(
    () =>
      rehearsalCell ? cellScores(rehearsalParser.data, ...rehearsalCell) : [],
    [rehearsalParser.data, rehearsalCell],
  );
  const submission = useComparisonSubmission({
    run: currentRun,
    enterPercents,
    rows: rehearsalParser.data,
    cell: rehearsalCell,
  });

  const downloadScores = useCallback(() => {
    const blob = new Blob([data.scores.join("\n")], { type: "text/csv" });
    downloadBlob(blob, "simulator_scores.csv");
    logEvent("simulator_scores_download", { count: data.scores.length });
  }, [data.scores]);

  return (
    <div
      id="simulator_result"
      className={c(styles.result, pending && styles.pending)}
      aria-busy={pending}
    >
      <div className={styles.contents} data-comparison-export-hide="true">
        <ScoreStats data={data} />

        <SimulatorResultGraphs data={data} plan={plan} />
      </div>

      <div className={styles.actions} data-export-hide="true">
        <Button fill size="sm" onClick={downloadScores}>
          <FaDownload />
          {t("downloadScores")}
        </Button>
        {canOptimizeParams(run.config.stage, run.enterPercents) && (
          <Button
            fill
            size="sm"
            className={styles.optimize}
            onClick={optimizeParams}
          >
            <OptimizeLabel feedback={optimizeFeedback} />
          </Button>
        )}
      </div>

      <div className={styles.details}>
        <div data-export-hide="true">
          <ButtonGroup
            options={tabs.map((value) => ({ value, label: t(value) }))}
            selected={shownTab}
            onChange={setTab}
          />
        </div>

        <div
          key={shownTab}
          className={c(styles.panel, tabSwitched && styles.panelEnter)}
          data-export-hide={shownTab == "rehearsal" ? undefined : "true"}
        >
          {shownTab === "logs" && (
            <SimulatorLogs
              minRun={data.minRun}
              averageRun={data.averageRun}
              maxRun={data.maxRun}
              idolId={idolId}
            />
          )}

          {shownTab === "stats" && (
            <SimulatorStats
              cardUsage={data.cardUsage}
              scoreStats={data.scoreStats}
            />
          )}

          {shownTab === "compare" && <CompareTab currentRun={currentRun} />}

          {shownTab === "rehearsal" && (
            <RehearsalComparison
              parser={rehearsalParser}
              simScores={data.scores}
              rehearsalScores={rehearsalScores}
              cell={rehearsalCell}
              onCellChange={setRehearsalCell}
              submission={submission}
            />
          )}
        </div>

        <div className={styles.footer} data-export-hide="true">
          <KofiAd />
          <a className={styles.toTop} href="#simulator_loadout">
            Top
            <FaCircleArrowUp />
          </a>
        </div>
      </div>
    </div>
  );
}

export default memo(SimulatorResult);
