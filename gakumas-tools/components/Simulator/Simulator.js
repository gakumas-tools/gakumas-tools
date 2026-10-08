"use client";
import {
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { FaHashtag, FaPercent } from "react-icons/fa6";
import {
  IdolConfig,
  StageConfig,
  IdolStageConfig,
  STRATEGIES,
  StageEngine,
  StagePlayer,
} from "gakumas-engine";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import Input from "@/components/Input";
import KofiAd from "@/components/KofiAd";
import LoadoutEditor from "@/components/LoadoutEditor";
import LoadoutSummary from "@/components/LoadoutHistory/LoadoutSummary";
import SimulatorResult from "@/components/SimulatorResult";
import StageSelect from "@/components/StageSelect";
import StrategyPicker from "@/components/StrategyPicker";
import LoadoutContext from "@/contexts/LoadoutContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import { simulate } from "@/simulator";
import { DEFAULT_NUM_RUNS, SYNC } from "@/simulator/constants";
import {
  retainWorkerPool,
  runOnWorkers,
  workerCount,
} from "@/simulator/workerPool";
import c from "@/utils/classNames";
import { createProgressStore } from "@/utils/progressStore";
import { bucketScores, getMedianScore, mergeResults } from "@/utils/simulator";
import usePersistedState from "@/utils/usePersistedState";
import ManualPlay from "./ManualPlay";
import SimulateButton from "./SimulateButton";
import SimulatorButtons from "./SimulatorButtons";
import SimulatorSubTools from "./SimulatorSubTools";
import styles from "./Simulator.module.scss";

const LINK_PHASES = ["OP", "MID", "ED"];
const NUM_RUNS_KEY = "gakumas-tools.simulator.numRuns";

export default function Simulator() {
  const t = useTranslations("Simulator");

  const {
    stage,
    loadout,
    simulatorUrl,
    setSupportBonus,
    loadouts,
    setLoadout,
    currentLoadoutIndex,
    setCurrentLoadoutIndex,
  } = useContext(LoadoutContext);
  const { pushRun } = useContext(SimulationRunsContext);
  const { plan, idolId } = useContext(WorkspaceContext);
  const [strategy, setStrategy] = useState("HeuristicStrategy");
  const [simulatorData, setSimulatorData] = useState(null);
  const [running, setRunning] = useState(false);
  const [numRuns, setNumRuns] = usePersistedState(
    NUM_RUNS_KEY,
    DEFAULT_NUM_RUNS,
  );
  const [enterPercents, setEnterPercents] = useState(false);

  const [pendingDecision, setPendingDecision] = useState(null);
  const resolveDecisionRef = useRef(null);
  const [progress] = useState(createProgressStore);
  const abortRef = useRef(null);
  const runSimulationRef = useRef(null);

  const config = useMemo(() => {
    const idolConfig = new IdolConfig(loadout);
    const stageConfig = new StageConfig(stage);
    return new IdolStageConfig(idolConfig, stageConfig, enterPercents);
  }, [loadout, stage, enterPercents]);

  const manualInputCallback = useCallback((decision) => {
    return new Promise((resolve) => {
      setPendingDecision(decision);
      resolveDecisionRef.current = resolve;
    });
  }, []);

  const handleDecision = useCallback((value) => {
    if (resolveDecisionRef.current) {
      resolveDecisionRef.current(value);
      resolveDecisionRef.current = null;
      setPendingDecision(null);
    }
  }, []);

  const linkConfigs = useMemo(() => {
    if (stage.type !== "linkContest") return null;
    return loadouts.map((ld) => {
      const idolConfig = new IdolConfig(ld);
      const stageConfig = new StageConfig(stage);
      return new IdolStageConfig(idolConfig, stageConfig, enterPercents);
    });
  }, [loadouts, stage, enterPercents]);

  useEffect(() => {
    // Seed a hardware-scaled default only when the user has no saved value.
    if (localStorage.getItem(NUM_RUNS_KEY) == null) {
      setNumRuns(Math.round(workerCount() / 2) * 1000);
    }
    return retainWorkerPool();
  }, []);

  const setResult = useCallback(
    (result) => {
      const { bucketedScores, bucketSize } = bucketScores(result.scores);
      const medianScore = getMedianScore(result.scores);

      console.timeEnd("simulation");

      setSimulatorData({ bucketedScores, medianScore, bucketSize, ...result });
      setRunning(false);

      pushRun({
        loadout,
        loadouts: stage.type === "linkContest" ? loadouts : null,
        scores: result.scores,
      });
    },
    [setSimulatorData, setRunning, pushRun, loadout, loadouts, stage],
  );

  async function startManualPlay() {
    setRunning(true);
    setSimulatorData(null);
    setPendingDecision(null);

    pushRun({
      loadout,
      loadouts: stage.type === "linkContest" ? loadouts : null,
      scores: null,
    });

    const engine = new StageEngine(config, linkConfigs);

    const wrappedInputCallback = async (decision) => {
      const currentLogs = engine.logger.getLogs(decision.state);
      currentLogs[currentLogs.length - 1] = {
        ...currentLogs[currentLogs.length - 1],
        isPending: true,
      };
      setSimulatorData({ logs: currentLogs });
      return await manualInputCallback(decision);
    };

    const ManualStrategy = STRATEGIES["ManualStrategy"];
    const strategy = new ManualStrategy(engine, wrappedInputCallback);
    engine.strategy = strategy;

    const player = new StagePlayer(engine, strategy);
    const result = await player.play();
    setSimulatorData({ logs: result.logs });
    setRunning(false);
  }

  const startSimulation = useCallback(() => runSimulationRef.current(), []);

  async function runSimulation() {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    progress.set(0);

    console.time("simulation");

    try {
      let result;
      if (SYNC) {
        result = await simulate(
          config,
          linkConfigs,
          strategy,
          numRuns,
          (completed) => progress.set(completed),
        );
      } else {
        const results = await runOnWorkers(
          {
            idolStageConfig: config,
            linkConfigs,
            strategyName: strategy,
            numRuns,
          },
          (delta) => progress.set((p) => p + delta),
          controller.signal,
        );
        result = mergeResults(results);
      }
      startTransition(() => setResult(result));
    } catch (err) {
      console.timeEnd("simulation");
      if (controller.signal.aborted) return;
      console.error(err);
      setRunning(false);
    }
  }
  runSimulationRef.current = runSimulation;

  return (
    <div id="simulator_loadout" className={styles.loadoutEditor}>
      <div className={styles.configurator}>
        {stage.preview && <Alert>{t("previewNote")}</Alert>}
        <StageSelect />
        {stage.type !== "contest" ? (
          <Alert>{t("enterPercents")}</Alert>
        ) : (
          <div className={styles.percentRow}>
            <ButtonGroup
              selected={enterPercents ? "percent" : "count"}
              options={[
                { value: "count", label: <FaHashtag /> },
                { value: "percent", label: <FaPercent /> },
              ]}
              onChange={(v) => setEnterPercents(v === "percent")}
            />
            {!enterPercents && (
              <div className={styles.supportBonusInput}>
                <label>{t("supportBonus")}</label>
                <Input
                  type="number"
                  value={parseFloat(
                    ((loadout.supportBonus || 0) * 100).toFixed(2),
                  )}
                  onChange={(value) =>
                    setSupportBonus(parseFloat((value / 100).toFixed(4)))
                  }
                />
              </div>
            )}
          </div>
        )}
        {stage.type == "linkContest" && (
          <Alert variant="warning">{t("linkContestNote")}</Alert>
        )}
        {stage.type == "linkContest" ? (
          <div className={styles.loadoutTabs}>
            {loadouts.map((loadout, index) => (
              <div key={index} className={styles.loadoutTab}>
                <button
                  className={c(
                    styles.selectButton,
                    index === currentLoadoutIndex && styles.selectedTab,
                  )}
                  aria-pressed={index === currentLoadoutIndex}
                  onClick={() => {
                    setLoadout(loadouts[index]);
                    setCurrentLoadoutIndex(index);
                  }}
                >
                  {LINK_PHASES[index]}
                </button>
                {index === currentLoadoutIndex ? (
                  <LoadoutEditor
                    config={config}
                    idolId={config.idol.idolId || idolId}
                  />
                ) : (
                  <div
                    className={styles.loadoutSummary}
                    onClick={() => {
                      setLoadout(loadouts[index]);
                      setCurrentLoadoutIndex(index);
                    }}
                  >
                    <LoadoutSummary loadout={loadout} showStage={false} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <LoadoutEditor
            config={config}
            idolId={config.idol.idolId || idolId}
          />
        )}

        <div data-export-hide="true">
          <SimulatorSubTools defaultCardIds={config.defaultCardIds} />
        </div>

        <div className={styles.simControls} data-export-hide="true">
          <div className={styles.strategyPicker}>
            <StrategyPicker
              strategy={strategy}
              setStrategy={(value) => {
                abortRef.current?.abort();
                setSimulatorData(null);
                setPendingDecision(null);
                setStrategy(value);
                setRunning(false);
              }}
            />
          </div>
          {strategy === "HeuristicStrategy" && (
            <div className={styles.numRunsRow}>
              <label>{t("numRuns")}</label>
              <span>{numRuns}</span>
              <input
                className={styles.numRunsSlider}
                style={{ "--fill": `${((numRuns - 1000) / 9000) * 100}%` }}
                type="range"
                value={numRuns}
                onChange={(e) => setNumRuns(parseInt(e.target.value, 10))}
                min={1000}
                max={10000}
                step={1000}
              />
            </div>
          )}
        </div>

        <div data-export-hide="true">
          {strategy === "HeuristicStrategy" && (
            <SimulateButton
              running={running}
              numRuns={numRuns}
              progress={progress}
              onRun={startSimulation}
            />
          )}

          {strategy === "ManualStrategy" && (
            <Button style="blue" fill onClick={startManualPlay}>
              {running ? t("restart") : t("start")}
            </Button>
          )}
        </div>

        <div className={styles.subLinks} data-export-hide="true">
          <SimulatorButtons />
          <a
            href="https://github.com/gakumas-tools/gakumas-tools/blob/master/gakumas-tools/simulator/CHANGELOG.md"
            target="_blank"
          >
            {t("lastUpdated")}: 2026-10-08
          </a>
        </div>
      </div>

      {strategy === "ManualStrategy" && simulatorData && (
        <ManualPlay
          logs={simulatorData.logs}
          pendingDecision={pendingDecision}
          onDecision={handleDecision}
          idolId={config.idol.idolId || idolId}
        />
      )}

      {strategy === "HeuristicStrategy" && simulatorData && (
        <SimulatorResult
          pending={running}
          data={simulatorData}
          config={config}
          enterPercents={enterPercents}
          idolId={config.idol.idolId || idolId}
          plan={config.idol.plan || plan}
        />
      )}

      {!simulatorData && <div className={styles.resultPlaceholder} />}
    </div>
  );
}
