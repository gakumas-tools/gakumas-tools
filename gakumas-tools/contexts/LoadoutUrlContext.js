"use client";
import { createContext, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  getStage,
  knownStageId,
  loadoutFromSearchParams,
  loadoutsFromSearchParams,
  loadoutsToSearchParams,
  loadoutToSearchParams,
} from "gakumas-loadout";

const LoadoutUrlContext = createContext();

export function LoadoutUrlContextProvider({ children }) {
  const searchParams = useSearchParams();
  const loadoutFromUrl = useMemo(
    () => loadoutFromSearchParams(searchParams),
    []
  );
  const loadoutsFromUrl = useMemo(
    () => loadoutsFromSearchParams(searchParams),
    []
  );

  const updateUrl = useCallback((loadout, loadouts) => {
    const url = new URL(window.location);

    if (loadout.stageId == "custom" || !knownStageId(loadout.stageId)) {
      window.history.replaceState(null, "", url.pathname);
      return;
    }
    const stage = getStage(loadout.stageId, loadout.customStage);

    if (stage.type === "linkContest") {
      url.search = loadoutsToSearchParams(loadouts).toString();
    } else {
      url.search = loadoutToSearchParams(loadout).toString();
    }

    window.history.replaceState(null, "", url);
  }, []);

  const value = useMemo(
    () => ({ loadoutFromUrl, loadoutsFromUrl, updateUrl }),
    [loadoutFromUrl, loadoutsFromUrl, updateUrl]
  );

  return (
    <LoadoutUrlContext.Provider value={value}>
      {children}
    </LoadoutUrlContext.Provider>
  );
}

export default LoadoutUrlContext;
