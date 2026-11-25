"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { LoadoutActionsContext } from "@/contexts/LoadoutContext";
import LoadoutUrlContext from "@/contexts/LoadoutUrlContext";
import {
  deriveRunMeta,
  extractLoadoutFields,
  loadHistoryFromStorage,
  MAX_HISTORY,
  newRunId,
  normalizeSavedRun,
  saveHistoryToStorage,
  sameRunInputs,
  summarizeScores,
} from "@/utils/simulationRun";

const SimulationRunsContext = createContext();

export function SimulationRunsContextProvider({ children }) {
  const { status } = useSession();
  const { loadoutFromUrl, loadoutsFromUrl } = useContext(LoadoutUrlContext);
  const { setLoadout, setLoadouts } = useContext(LoadoutActionsContext);

  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [savedRuns, setSavedRuns] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState(false);
  const [savedWanted, setSavedWanted] = useState(false);
  // Saved run id → the id of its shared copy, for the user's shared runs.
  const [sharedIds, setSharedIds] = useState({});
  // Shared run id → true, for those listed on their stage's page.
  const [listedIds, setListedIds] = useState({});
  // Shared run id → { count, more }: how many others have opened its link.
  const [openers, setOpeners] = useState({});
  const savedRunsRef = useRef(savedRuns);
  savedRunsRef.current = savedRuns;
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const runs = loadHistoryFromStorage();
    setHistory(runs);

    const urlHasData =
      loadoutFromUrl?.hasDataFromParams || loadoutsFromUrl?.length;
    if (!urlHasData && runs.length) {
      const first = runs[0];
      setLoadout(first.loadout);
      if (first.linkLoadouts?.length) {
        setLoadouts(first.linkLoadouts);
      }
    }

    setLoaded(true);
  }, [loadoutFromUrl, loadoutsFromUrl, setLoadout, setLoadouts]);

  useEffect(() => {
    if (!loaded) return;
    saveHistoryToStorage(history);
  }, [history, loaded]);

  // Which saved runs are shared only marks them; a failure here leaves
  // the saved runs usable.
  const fetchShared = useCallback(async () => {
    try {
      const res = await fetch("/api/share");
      if (!res.ok) throw new Error(`GET /api/share failed with ${res.status}`);
      const list = await res.json();
      setSharedIds(
        Object.fromEntries(list.map(({ id, loadoutId }) => [loadoutId, id])),
      );
      setListedIds(
        Object.fromEntries(
          list.filter(({ listed }) => listed).map(({ id }) => [id, true]),
        ),
      );
      setOpeners(
        Object.fromEntries(
          list
            .filter(({ openedBy }) => openedBy > 0)
            .map(({ id, openedBy, openedByMore }) => [
              id,
              { count: openedBy, more: !!openedByMore },
            ]),
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchSaved = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setSavedLoading(true);
    try {
      const res = await fetch("/api/loadout");
      if (!res.ok) {
        throw new Error(`GET /api/loadout failed with ${res.status}`);
      }
      const list = await res.json();
      setSavedRuns(list.map(normalizeSavedRun).filter(Boolean));
      setSavedError(false);
      fetchShared();
    } catch (err) {
      console.error(err);
      setSavedError(true);
    } finally {
      setSavedLoading(false);
    }
  }, [fetchShared]);

  const mutateSaved = useCallback(
    async (method, body) => {
      try {
        const res = await fetch("/api/loadout", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`${method} /api/loadout failed with ${res.status}`);
        }
        return res;
      } finally {
        await fetchSaved({ quiet: true });
      }
    },
    [fetchSaved],
  );

  const requestSaved = useCallback(() => setSavedWanted(true), []);

  useEffect(() => {
    if (status === "authenticated") {
      if (savedWanted) fetchSaved();
    } else if (status === "unauthenticated") {
      setSavedRuns([]);
      setSharedIds({});
      setListedIds({});
      setSavedLoading(false);
    }
  }, [status, savedWanted, fetchSaved]);

  const pushRun = useCallback(({ loadout, loadouts, scores }) => {
    const base = extractLoadoutFields(loadout);
    const linkLoadouts = Array.isArray(loadouts)
      ? loadouts.map(extractLoadoutFields)
      : null;
    const stats = scores ? summarizeScores(scores) : null;
    const run = {
      id: newRunId(),
      createdAt: new Date().toISOString(),
      loadout: base,
      linkLoadouts,
      stats,
      derived: deriveRunMeta(base),
    };
    setHistory((cur) => {
      const prev = cur[0];
      if (prev && sameRunInputs(prev, run)) {
        return [run, ...cur.slice(1)];
      }
      return [run, ...cur].slice(0, MAX_HISTORY);
    });
    return run;
  }, []);

  const deleteHistoryRun = useCallback((id) => {
    setHistory((cur) => cur.filter((r) => r.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const saveRun = useCallback(
    async (run, name) => {
      const body = {
        name,
        ...run.loadout,
        linkLoadouts: run.linkLoadouts,
        stats: run.stats,
        derived: run.derived,
      };
      const res = await mutateSaved("POST", body);
      const data = await res.json();
      return data.id;
    },
    [mutateSaved],
  );

  const mutateSavedOptimistically = useCallback(
    async (update, method, body) => {
      const previousRuns = savedRunsRef.current;
      const optimisticRuns = update(previousRuns);
      setSavedRuns(optimisticRuns);
      try {
        await mutateSaved(method, body);
      } catch (err) {
        setSavedRuns((cur) => (cur === optimisticRuns ? previousRuns : cur));
        throw err;
      }
    },
    [mutateSaved],
  );

  const deleteSaved = useCallback(
    async (ids) => {
      const idSet = new Set(ids);
      await mutateSavedOptimistically(
        (runs) => runs.filter((r) => !idSet.has(r._id || r.id)),
        "DELETE",
        { ids },
      );
    },
    [mutateSavedOptimistically],
  );

  const renameSaved = useCallback(
    async (id, name) => {
      await mutateSavedOptimistically(
        (runs) =>
          runs.map((r) => ((r._id || r.id) === id ? { ...r, name } : r)),
        "PATCH",
        { id, name },
      );
    },
    [mutateSavedOptimistically],
  );

  const shareSaved = useCallback(async (loadoutId) => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loadoutId }),
    });
    if (!res.ok) throw new Error(`POST /api/share failed with ${res.status}`);
    const { id } = await res.json();
    setSharedIds((cur) => ({ ...cur, [loadoutId]: id }));
    return id;
  }, []);

  const unshareSaved = useCallback(
    async (loadoutId) => {
      const id = sharedIds[loadoutId];
      if (!id) return;
      const res = await fetch("/api/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // 404: already taken down.
      if (!res.ok && res.status != 404) {
        throw new Error(`DELETE /api/share failed with ${res.status}`);
      }
      setSharedIds(({ [loadoutId]: _, ...rest }) => rest);
      setListedIds(({ [id]: _, ...rest }) => rest);
    },
    [sharedIds],
  );

  // Lists or unlists a shared saved run on its stage's page.
  const setSavedListed = useCallback(
    async (loadoutId, listed) => {
      const id = sharedIds[loadoutId];
      if (!id) return;
      const res = await fetch("/api/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, listed }),
      });
      if (!res.ok) throw new Error(`PATCH /api/share failed with ${res.status}`);
      setListedIds(({ [id]: _, ...rest }) =>
        listed ? { ...rest, [id]: true } : rest,
      );
    },
    [sharedIds],
  );

  // Saves a run, shares it and shows it on its stage's page, in one go, for
  // the stage's panel of listed runs. The shared run's id.
  const listRun = useCallback(
    async (run, name) => {
      const loadoutId = await saveRun(run, name);
      const id = await shareSaved(loadoutId);
      const res = await fetch("/api/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, listed: true }),
      });
      if (!res.ok) throw new Error(`PATCH /api/share failed with ${res.status}`);
      setListedIds((cur) => ({ ...cur, [id]: true }));
      return id;
    },
    [saveRun, shareSaved],
  );

  // Puts someone else's run (a shared one) at the top of the history, so it
  // can be loaded and compared like the user's own.
  const addToHistory = useCallback((run) => {
    const entry = {
      id: newRunId(),
      createdAt: new Date().toISOString(),
      name: run.name || null,
      loadout: extractLoadoutFields(run.loadout),
      linkLoadouts: run.linkLoadouts?.map(extractLoadoutFields) || null,
      stats: run.stats || null,
      derived: run.derived || deriveRunMeta(run.loadout),
    };
    setHistory((cur) =>
      [entry, ...cur.filter((r) => !sameRunInputs(r, entry))].slice(
        0,
        MAX_HISTORY,
      ),
    );
    return entry;
  }, []);

  const loadRun = useCallback(
    (run) => {
      setLoadout(run.loadout);
      if (run.linkLoadouts?.length) {
        setLoadouts(run.linkLoadouts);
      }
    },
    [setLoadout, setLoadouts],
  );

  const value = useMemo(
    () => ({
      history,
      savedRuns,
      savedLoading,
      savedError,
      pushRun,
      deleteHistoryRun,
      clearHistory,
      saveRun,
      deleteSaved,
      renameSaved,
      sharedIds,
      listedIds,
      openers,
      shareSaved,
      unshareSaved,
      setSavedListed,
      listRun,
      addToHistory,
      loadRun,
      requestSaved,
      refetchSaved: fetchSaved,
    }),
    [
      history,
      savedRuns,
      savedLoading,
      savedError,
      pushRun,
      deleteHistoryRun,
      clearHistory,
      saveRun,
      deleteSaved,
      renameSaved,
      sharedIds,
      listedIds,
      openers,
      shareSaved,
      unshareSaved,
      setSavedListed,
      listRun,
      addToHistory,
      loadRun,
      requestSaved,
      fetchSaved,
    ],
  );

  return (
    <SimulationRunsContext.Provider value={value}>
      {children}
    </SimulationRunsContext.Provider>
  );
}

export default SimulationRunsContext;
