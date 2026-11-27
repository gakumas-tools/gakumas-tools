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
import { useSearchParams } from "next/navigation";
import { FaHashtag, FaPercent } from "react-icons/fa6";
import {
  IdolConfig,
  StageConfig,
  IdolStageConfig,
  planPDrinkTurns,
  STRATEGIES,
  StageEngine,
  StagePlayer,
} from "gakumas-engine";
import { PDrinks } from "gakumas-data";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import IdolRoadDataNotice from "@/components/IdolRoadDataNotice";
import Input from "@/components/Input";
import KofiAd from "@/components/KofiAd";
import LoadoutEditor from "@/components/LoadoutEditor";
import LoadoutSummary from "@/components/LoadoutHistory/LoadoutSummary";
import SimulatorResult from "@/components/SimulatorResult";
import StageSelect from "@/components/StageSelect";
import StageSharedRuns from "@/components/StageSharedRuns";
import StrategyPicker from "@/components/StrategyPicker";
import StagePDrinks from "@/components/StagePDrinks";
import StageStartStamina from "@/components/StageStartStamina";
import TurnOrder from "@/components/TurnOrder";
import LoadoutContext from "@/contexts/LoadoutContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import { simulate } from "@/simulator";
import { DEFAULT_NUM_RUNS, SYNC } from "@/simulator/constants";
import {
  planPDrinksOnWorkers,
  retainWorkerPool,
  runOnWorkers,
  workerCount,
} from "@/simulator/workerPool";
import c from "@/utils/classNames";
import { createProgressStore } from "@/utils/progressStore";
import { reportShareUse } from "@/utils/shareUse";
import { extractLoadoutFields } from "@/utils/simulationRun";
import { bucketScores, getMedianScore, mergeResults } from "@/utils/simulator";
import usePersistedState from "@/utils/usePersistedState";
import ManualPlay from "./ManualPlay";
import SimulateButton from "./SimulateButton";
import SimulatorButtons from "./SimulatorButtons";
import SimulatorSubTools from "./SimulatorSubTools";
import styles from "./Simulator.module.scss";

const LINK_PHASES = ["OP", "MID", "ED"];
const NUM_RUNS_KEY = "gakumas-tools.simulator.numRuns";

// The engine's planned drink turns (one per drink it holds, the loadout's
// known drinks in slot order) under the loadout's slots.
function plannedBySlot(pDrinkIds, pDrinkTurns) {
  if (!pDrinkTurns) return null;
  let held = 0;
  return pDrinkIds.map((id) =>
    id && PDrinks.getById(id) ? (pDrinkTurns[held++] ?? null) : null,
  );
}

export default function Simulator() {
  const t = useTranslations("Simulator");

  const {
    stage,
    loadout,
    simulatorUrl,
    setSupportBonus,
    setEnterPercents,
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
  const [simError, setSimError] = useState(null);
  const [numRuns, setNumRuns] = usePersistedState(
    NUM_RUNS_KEY,
    DEFAULT_NUM_RUNS,
  );
  const { enterPercents } = loadout;

  const [pendingDecision, setPendingDecision] = useState(null);
  const resolveDecisionRef = useRef(null);
  const [progress] = useState(createProgressStore);
  const abortRef = useRef(null);
  const runSimulationRef = useRef(null);

  // A shared link this page was loaded with (cards or loadout in the URL at
  // mount): running it or changing it counts as someone using it.
  const searchParams = useSearchParams();
  const sharedQuery = useMemo(
    () =>
      searchParams?.get("cards") || searchParams?.getAll("loadout").some(Boolean)
        ? searchParams.toString()
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialSimulatorUrl = useRef(simulatorUrl);
  const reportUse = useCallback(
    () => reportShareUse("simulator", sharedQuery),
    [sharedQuery],
  );
  useEffect(() => {
    if (simulatorUrl !== initialSimulatorUrl.current) reportUse();
  }, [simulatorUrl, reportUse]);

  const config = useMemo(() => {
    const idolConfig = new IdolConfig(loadout);
    const stageConfig = new StageConfig(stage);
    return new IdolStageConfig(idolConfig, stageConfig, enterPercents);
  }, [loadout, stage, enterPercents]);

  const manualInputCallback = useCallback((decision, signal) => {
    return new Promise((resolve, reject) => {
      setPendingDecision(decision);
      resolveDecisionRef.current = resolve;
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
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
    let savedNumRuns = null;
    try {
      savedNumRuns = localStorage.getItem(NUM_RUNS_KEY);
    } catch {}
    if (savedNumRuns == null) {
      setNumRuns(Math.round(workerCount() / 2) * 1000);
    }
    return retainWorkerPool();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const setResult = useCallback(
    (result, input) => {
      const { bucketedScores, bucketSize } = bucketScores(result.scores);
      const medianScore = getMedianScore(result.scores);

      console.timeEnd("simulation");

      const run = pushRun({
        loadout: input.loadout,
        loadouts: input.loadouts,
        scores: result.scores,
      });
      setSimulatorData({
        bucketedScores,
        medianScore,
        bucketSize,
        ...result,
        input,
        run,
      });
      setRunning(false);
    },
    [pushRun],
  );

  function getInput() {
    // Link loadouts get their stage and params replaced in place on edits.
    return {
      loadout: extractLoadoutFields(loadout),
      loadouts:
        stage.type === "linkContest"
          ? loadouts.map(extractLoadoutFields)
          : null,
      config,
      linkConfigs,
      enterPercents,
      idolId: config.idol.idolId || idolId,
      plan: config.idol.plan || plan,
    };
  }

  function failSimulation(err) {
    console.error(err);
    setSimulatorData(null);
    setSimError(t("simulationFailed"));
  }

  async function startManualPlay() {
    reportUse();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const input = getInput();
    setRunning(true);
    setSimError(null);
    setSimulatorData(null);
    setPendingDecision(null);

    pushRun({
      loadout: input.loadout,
      loadouts: input.loadouts,
      scores: null,
    });

    try {
      const engine = new StageEngine(input.config, input.linkConfigs);

      const wrappedInputCallback = async (decision) => {
        const currentLogs = engine.logger.getLogs(decision.state);
        currentLogs[currentLogs.length - 1] = {
          ...currentLogs[currentLogs.length - 1],
          isPending: true,
        };
        setSimulatorData({ logs: currentLogs, input });
        return await manualInputCallback(decision, controller.signal);
      };

      const ManualStrategy = STRATEGIES["ManualStrategy"];
      const strategy = new ManualStrategy(engine, wrappedInputCallback);
      engine.strategy = strategy;

      const player = new StagePlayer(engine, strategy);
      const result = await player.play();
      setSimulatorData({ logs: result.logs, input });
    } catch (err) {
      if (controller.signal.aborted) return;
      setPendingDecision(null);
      failSimulation(err);
    }
    setRunning(false);
  }

  const startSimulation = useCallback(() => runSimulationRef.current(), []);

  async function runSimulation() {
    reportUse();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const input = getInput();
    setRunning(true);
    setSimError(null);
    progress.set(0);

    console.time("simulation");

    try {
      let result;
      const pDrinkTurns = await planPDrinks(input, controller.signal);
      if (controller.signal.aborted) return;
      input.plannedPDrinkTurns = plannedBySlot(
        input.loadout.pDrinkIds,
        pDrinkTurns,
      );
      if (SYNC) {
        result = await simulate(
          input.config,
          input.linkConfigs,
          strategy,
          numRuns,
          (completed) => progress.set(completed),
          pDrinkTurns,
        );
      } else {
        const results = await runOnWorkers(
          {
            idolStageConfig: input.config,
            linkConfigs: input.linkConfigs,
            strategyName: strategy,
            numRuns,
            pDrinkTurns,
          },
          (delta) => progress.set((p) => p + delta),
          controller.signal,
        );
        result = mergeResults(results);
      }
      if (controller.signal.aborted) return;
      startTransition(() => setResult(result, input));
    } catch (err) {
      console.timeEnd("simulation");
      if (controller.signal.aborted) return;
      failSimulation(err);
      setRunning(false);
    }
  }
  runSimulationRef.current = runSimulation;

  // The turn of each P-drink left on auto, planned before the runs (one
  // per drink the engine holds), or null when none is on auto.
  async function planPDrinks(input, signal) {
    if (!SYNC) {
      return planPDrinksOnWorkers(
        {
          idolStageConfig: input.config,
          linkConfigs: input.linkConfigs,
          strategyName: strategy,
        },
        signal,
      );
    }
    const engine = new StageEngine(input.config, input.linkConfigs);
    engine.strategy = new STRATEGIES[strategy](engine);
    return planPDrinkTurns(engine, engine.strategy);
  }

  return (
    <div id="simulator_loadout" className={styles.loadoutEditor}>
      <div className={styles.configurator}>
        {stage.preview && <Alert>{t("previewNote")}</Alert>}
        <StageSelect />
        <IdolRoadDataNotice stage={stage} pIdolId={config.idol.pIdolId} />
        {stage.type == "produceExam" && (
          <>
            <TurnOrder />
            <StagePDrinks
              plannedTurns={
                simulatorData?.input.config === config
                  ? simulatorData.input.plannedPDrinkTurns
                  : null
              }
            />
            <StageStartStamina />
          </>
        )}
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
                setSimError(null);
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
          <SimulatorButtons
            run={
              strategy === "HeuristicStrategy" &&
              !running &&
              simulatorData?.input.config === config &&
              simulatorData?.input.linkConfigs === linkConfigs
                ? simulatorData.run
                : null
            }
          />
          <a
            href="https://github.com/gakumas-tools/gakumas-tools/blob/master/gakumas-tools/simulator/CHANGELOG.md"
            target="_blank"
          >
            {t("lastUpdated")}: 2026-11-27
          </a>
        </div>
      </div>

      {!simulatorData && !simError && (
        <div className={styles.resultPlaceholder} />
      )}

      <div className={styles.resultColumn}>
        {strategy === "ManualStrategy" && simulatorData && (
          <ManualPlay
            logs={simulatorData.logs}
            pendingDecision={pendingDecision}
            onDecision={handleDecision}
            idolId={simulatorData.input.idolId}
          />
        )}

        {strategy === "HeuristicStrategy" && simulatorData && (
          <SimulatorResult
            pending={running}
            data={simulatorData}
            config={config}
            stale={
              simulatorData.input.config !== config ||
              simulatorData.input.linkConfigs !== linkConfigs
            }
            enterPercents={simulatorData.input.enterPercents}
            idolId={simulatorData.input.idolId}
            plan={simulatorData.input.plan}
          />
        )}

        {!simulatorData && simError && (
          <Alert variant="danger" className={styles.resultError}>
            {simError}
          </Alert>
        )}

        {/* Under the result, in its column, so it never takes a column of its own. */}
        <div className={styles.stageSharedRuns} data-export-hide="true">
          <StageSharedRuns
            stageId={stage.id}
            yourRun={
              strategy === "HeuristicStrategy" &&
              !running &&
              simulatorData?.input.config === config &&
              simulatorData?.input.linkConfigs === linkConfigs
                ? simulatorData.run
                : null
            }
          />
        </div>
      </div>
    </div>
  );
}
