"use client";
import { memo, useContext, useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import ButtonGroup from "@/components/ButtonGroup";
import ConfirmModal from "@/components/ConfirmModal";
import Loader from "@/components/Loader";
import ModalContext from "@/contexts/ModalContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import {
  computeRange,
  computeTicks,
  getIdolName,
  MAX_HISTORY,
  stageKeyOf,
  stageLabelOf,
} from "@/utils/simulationRun";
import c from "@/utils/classNames";
import usePersistedState from "@/utils/usePersistedState";
import AxisRow from "./AxisRow";
import CompareRow from "./CompareRow";
import styles from "./SimulationRuns.module.scss";

function CompareTab({ currentRun, onAfterLoad }) {
  const t = useTranslations("CompareTab");
  const tStage = useTranslations("StageSummary");
  const { status } = useSession();
  const { setModal } = useContext(ModalContext);
  const {
    history,
    savedRuns,
    savedLoading,
    savedError,
    refetchSaved,
    saveRun,
    deleteHistoryRun,
    deleteSaved,
    renameSaved,
    loadRun,
    requestSaved,
  } = useContext(SimulationRunsContext);

  const [deleteErrors, setDeleteErrors] = useState({});

  useEffect(() => {
    requestSaved();
  }, [requestSaved]);

  const [subTab, setSubTab] = usePersistedState(
    "gakumas-tools.compare.subTab",
    "history",
  );
  const [stageFilter, setStageFilter] = usePersistedState(
    "gakumas-tools.compare.stageFilter",
    "all",
  );
  const [stageFilterTouched, setStageFilterTouched] = usePersistedState(
    "gakumas-tools.compare.stageFilterTouched",
    false,
  );
  const [seasonFilter, setSeasonFilter] = usePersistedState(
    "gakumas-tools.compare.seasonFilter",
    "all",
  );
  const [idolFilter, setIdolFilter] = usePersistedState(
    "gakumas-tools.compare.idolFilter",
    "all",
  );

  // Default stage filter to current run's stage, until user changes it.
  useEffect(() => {
    if (stageFilterTouched) return;
    const key = stageKeyOf(currentRun);
    if (key) setStageFilter(key);
  }, [currentRun, stageFilterTouched]);

  const historyRuns = useMemo(() => {
    if (!currentRun) return history;
    return history.filter((r) => r.id !== currentRun.id);
  }, [history, currentRun]);

  const applyFilters = (runs) =>
    runs.filter((r) => {
      if (stageFilter !== "all") {
        if (stageKeyOf(r) !== stageFilter) return false;
      }
      if (seasonFilter !== "all") {
        if (String(r.derived?.season || "") !== seasonFilter) return false;
      }
      if (idolFilter !== "all") {
        if (String(r.derived?.idolId || "") !== idolFilter) return false;
      }
      return true;
    });

  const filteredHistory = useMemo(
    () => applyFilters(historyRuns),
    [historyRuns, stageFilter, seasonFilter, idolFilter],
  );
  const filteredSaved = useMemo(
    () => applyFilters(savedRuns),
    [savedRuns, stageFilter, seasonFilter, idolFilter],
  );

  const visibleRuns = subTab === "saved" ? filteredSaved : filteredHistory;

  const range = useMemo(() => {
    const all = [];
    if (currentRun) all.push(currentRun);
    for (const r of visibleRuns) all.push(r);
    return computeRange(all);
  }, [currentRun, visibleRuns]);

  const ticks = useMemo(
    () => computeTicks(range.min, range.max),
    [range],
  );

  const allPools = useMemo(
    () => [...history, ...savedRuns, ...(currentRun ? [currentRun] : [])],
    [history, savedRuns, currentRun],
  );

  const stageOptions = useMemo(() => {
    const map = new Map();
    for (const r of allPools) {
      const key = stageKeyOf(r);
      if (!key || map.has(key)) continue;
      map.set(key, stageLabelOf(r, tStage("custom")) || key);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPools, tStage]);

  const seasonOptions = useMemo(() => {
    const seasons = new Set();
    for (const r of allPools) {
      if (r.derived?.season) seasons.add(r.derived.season);
    }
    return [...seasons].sort((a, b) => a - b);
  }, [allPools]);

  const idolOptions = useMemo(() => {
    const idols = new Map();
    for (const r of allPools) {
      const id = r.derived?.idolId;
      if (id && !idols.has(id)) {
        idols.set(id, getIdolName(id) || String(id));
      }
    }
    return [...idols.entries()];
  }, [allPools]);

  function promptSignIn() {
    setModal(
      <ConfirmModal
        message={t("signInPrompt")}
        onConfirm={() => signIn("discord")}
      />,
    );
  }

  async function handleSave(run, name) {
    if (status !== "authenticated") {
      promptSignIn();
      return;
    }
    await saveRun(run, name);
  }

  async function handleRename(run, name) {
    if (run.name === name) return;
    await renameSaved(run._id || run.id, name);
  }

  function handleLoad(run) {
    loadRun(run);
    if (onAfterLoad) onAfterLoad();
  }

  function confirmDelete(onConfirm) {
    setModal(
      <ConfirmModal
        message={t("confirmDelete")}
        confirmLabel={t("delete")}
        danger
        onConfirm={onConfirm}
      />,
    );
  }

  function handleDeleteHistory(run) {
    confirmDelete(() => deleteHistoryRun(run.id));
  }

  function handleDeleteSaved(run) {
    confirmDelete(async () => {
      setDeleteErrors(({ [run.id]: _, ...rest }) => rest);
      try {
        await deleteSaved([run._id || run.id]);
      } catch (err) {
        console.error(err);
        setDeleteErrors((cur) => ({ ...cur, [run.id]: t("deleteFailed") }));
      }
    });
  }

  const filterCls = (v) => c(styles.filter, v !== "all" && styles.filterActive);

  const hasActiveFilters =
    stageFilter !== "all" || seasonFilter !== "all" || idolFilter !== "all";

  function clearFilters() {
    setStageFilter("all");
    setStageFilterTouched(true);
    setSeasonFilter("all");
    setIdolFilter("all");
  }

  const totalRuns = subTab === "saved" ? savedRuns.length : historyRuns.length;
  const hiddenCount = totalRuns - visibleRuns.length;

  const showFifoNote = subTab === "history" && history.length > 0;

  return (
    <div className={styles.compare}>
      <div className={styles.subTabs}>
        <ButtonGroup
          selected={subTab}
          options={[
            { value: "history", label: t("history") },
            { value: "saved", label: t("saved") },
          ]}
          onChange={setSubTab}
        />
        <div className={styles.filters}>
          <select
            className={filterCls(stageFilter)}
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setStageFilterTouched(true);
            }}
          >
            <option value="all">{t("allStages")}</option>
            {stageOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            className={filterCls(seasonFilter)}
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
          >
            <option value="all">{t("allSeasons")}</option>
            {seasonOptions.map((s) => (
              <option key={s} value={String(s)}>
                {t("season")} {s}
              </option>
            ))}
          </select>
          <select
            className={filterCls(idolFilter)}
            value={idolFilter}
            onChange={(e) => setIdolFilter(e.target.value)}
          >
            <option value="all">{t("allIdols")}</option>
            {idolOptions.map(([id, name]) => (
              <option key={id} value={String(id)}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(currentRun || visibleRuns.length > 0) && (
        <AxisRow ticks={ticks} xMin={range.min} xMax={range.max} />
      )}

      {currentRun && (
        <CompareRow
          run={currentRun}
          xMin={range.min}
          xMax={range.max}
          ticks={ticks}
          current
          onSave={handleSave}
        />
      )}

      {showFifoNote && (
        <div
          className={c(
            styles.fifoNote,
            history.length >= MAX_HISTORY && styles.fifoNoteWarn
          )}
        >
          {history.length >= MAX_HISTORY
            ? t("fifoAtLimit", { max: MAX_HISTORY })
            : t("fifoHint", { count: history.length, max: MAX_HISTORY })}
        </div>
      )}

      {subTab === "saved" && status === "unauthenticated" ? (
        <div className={styles.empty}>{t("signInToView")}</div>
      ) : subTab === "saved" &&
        (status === "loading" || savedLoading) ? (
        <div className={styles.empty}>
          <Loader size="large" />
        </div>
      ) : subTab === "saved" && savedError && !savedRuns.length ? (
        <div className={styles.empty}>
          <div>{t("loadFailed")}</div>
          <button className={styles.clearFiltersLink} onClick={refetchSaved}>
            {t("retry")}
          </button>
        </div>
      ) : visibleRuns.length === 0 ? (
        <div className={styles.empty}>
          {totalRuns > 0 ? (
            <>
              <div>
                {t("allHiddenByFilters", { count: totalRuns })}
              </div>
              <button className={styles.clearFiltersLink} onClick={clearFilters}>
                {t("clearFilters")}
              </button>
            </>
          ) : subTab === "saved" ? (
            t("emptySaved")
          ) : (
            t("emptyHistory")
          )}
        </div>
      ) : (
        <>
          {visibleRuns.map((run) => (
            <CompareRow
              key={run.id}
              run={run}
              xMin={range.min}
              xMax={range.max}
              ticks={ticks}
              showTime={subTab === "history"}
              error={subTab === "saved" ? deleteErrors[run.id] : undefined}
              onLoad={handleLoad}
              onSave={subTab === "history" ? handleSave : undefined}
              onRename={subTab === "saved" ? handleRename : undefined}
              onDelete={
                subTab === "saved" ? handleDeleteSaved : handleDeleteHistory
              }
            />
          ))}
          {hasActiveFilters && hiddenCount > 0 && (
            <div className={styles.hiddenNote}>
              {t("hiddenByFilters", { count: hiddenCount })}
              <button
                className={styles.clearFiltersLink}
                onClick={clearFilters}
              >
                {t("clearFilters")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(CompareTab);
