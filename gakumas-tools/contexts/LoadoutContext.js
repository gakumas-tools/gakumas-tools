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
import { usePathname } from "@/i18n/routing";
import LoadoutUrlContext from "@/contexts/LoadoutUrlContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import {
  getDefaultParams,
  getSimulatorUrl,
  getStage,
  knownStageId,
} from "@/utils/simulator";
import { setMemorySlot } from "@/utils/memorySlots";
import { fixCustomizations } from "@/utils/customizations";

const LoadoutContext = createContext();

export const LoadoutActionsContext = createContext();

export function LoadoutContextProvider({ children }) {
  const pathname = usePathname();
  const { loadoutFromUrl, loadoutsFromUrl, updateUrl } =
    useContext(LoadoutUrlContext);
  const { setPlan } = useContext(WorkspaceContext);

  const initialLoadout = loadoutsFromUrl[0] || loadoutFromUrl;

  const [memorySlots, setMemorySlots] = useState([null, null]);
  const [stageId, setStageId] = useState(initialLoadout.stageId);
  const [customStage, setCustomStage] = useState(null);
  const [supportBonus, setSupportBonus] = useState(initialLoadout.supportBonus);
  const [params, setParams] = useState(initialLoadout.params);
  const [pItemIds, setPItemIds] = useState(initialLoadout.pItemIds);
  const [skillCardIdGroups, setSkillCardIdGroups] = useState(
    initialLoadout.skillCardIdGroups
  );
  const [customizationGroups, setCustomizationGroups] = useState(
    initialLoadout.customizationGroups
  );

  const stage = getStage(stageId, customStage);

  const loadout = useMemo(
    () => ({
      stageId,
      customStage: stageId == "custom" ? customStage : {},
      supportBonus,
      params,
      pItemIds,
      skillCardIdGroups,
      customizationGroups,
    }),
    [
      stageId,
      customStage,
      supportBonus,
      params,
      pItemIds,
      skillCardIdGroups,
      customizationGroups,
    ]
  );

  const [currentLoadoutIndex, setCurrentLoadoutIndex] = useState(0);
  const [loadouts, setLoadouts] = useState(
    loadoutsFromUrl.length ? loadoutsFromUrl : [loadout]
  );

  const simulatorUrl = useMemo(
    () => getSimulatorUrl(loadout, loadouts),
    [loadout, loadouts]
  );

  const setLoadout = useCallback((loadout) => {
    setStageId(knownStageId(loadout.stageId));
    if (loadout.stageId == "custom") {
      let custom = loadout.customStage;
      if (Array.isArray(custom.firstTurns)) {
        const length = custom.firstTurns.length;
        custom.firstTurns = custom.firstTurns.reduce((acc, cur) => {
          acc[cur] = 1 / length;
          return acc;
        }, {});
      }
      setCustomStage(custom);
    }
    setSupportBonus(loadout.supportBonus);
    setParams(loadout.params);
    setPItemIds(loadout.pItemIds);
    setSkillCardIdGroups(loadout.skillCardIdGroups);
    if (loadout.customizationGroups) {
      try {
        setCustomizationGroups(
          loadout.customizationGroups.map((g) => g.map(fixCustomizations))
        );
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    if (["sense", "logic", "anomaly"].includes(stage.plan)) {
      setPlan(stage.plan);
    }

    if (stage.type !== "linkContest") return;
    if (loadouts.length == stage.linkTurnCounts.length) return;

    setLoadouts((cur) => {
      const next = [...cur];
      while (next.length < stage.linkTurnCounts.length) {
        next.push(loadout);
      }
      return next;
    });
  }, [stage]);

  // Update browser URL when the loadout changes
  useEffect(() => {
    if (pathname !== "/simulator") return;
    updateUrl(loadout, loadouts);
  }, [loadout]);

  // Update link loadouts when loadout changes
  useEffect(() => {
    if (stage.type == "linkContest") {
      setLoadouts((cur) => {
        const next = [...cur];
        next[currentLoadoutIndex] = loadout;
        for (let i = 0; i < next.length; i++) {
          next[i].stageId = loadout.stageId;
          next[i].params = [...loadout.params.slice(0, 3), next[i].params[3]];
        }
        return next;
      });
    }
  }, [loadout]);

  useEffect(() => {
    // If fewer than 4 pItems, pad with 0s
    if (pItemIds.length < 4) {
      setPItemIds((cur) => cur.concat(new Array(4 - cur.length).fill(0)));
    }
  }, [pItemIds]);

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const memorySlotsRef = useRef(memorySlots);
  memorySlotsRef.current = memorySlots;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const clear = useCallback(() => {
    setMemorySlots([null, null]);
    setParams(getDefaultParams(stageRef.current));
    setPItemIds([0, 0, 0, 0]);
    setSkillCardIdGroups([
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ]);
    setCustomizationGroups([
      [{}, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, {}, {}],
    ]);
  }, []);

  const replacePItemId = useCallback((index, itemId) => {
    setPItemIds((cur) => {
      const next = [...cur];
      next[index] = itemId;
      return next;
    });
  }, []);

  const swapPItemIds = useCallback((indexA, indexB) => {
    setPItemIds((cur) => {
      const next = [...cur];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
  }, []);

  const replaceCustomizations = useCallback((index, customizations) => {
    setCustomizationGroups((cur) => {
      const curCustomizations = [].concat(...cur);
      const updatedCustomizations = [...curCustomizations];
      updatedCustomizations[index] = customizations;
      let chunks = [];
      for (let i = 0; i < updatedCustomizations.length; i += 6) {
        chunks.push(updatedCustomizations.slice(i, i + 6));
      }
      return chunks;
    });
  }, []);

  const replaceSkillCardId = useCallback((index, cardId) => {
    let changed = false;
    setSkillCardIdGroups((cur) => {
      const skillCardIds = [].concat(...cur);
      const updatedSkillCardIds = [...skillCardIds];
      if (cardId != updatedSkillCardIds[index]) {
        changed = true;
      }
      updatedSkillCardIds[index] = cardId;
      let chunks = [];
      for (let i = 0; i < updatedSkillCardIds.length; i += 6) {
        chunks.push(updatedSkillCardIds.slice(i, i + 6));
      }
      return chunks;
    });
    if (changed) {
      replaceCustomizations(index, []);
    }
  }, [replaceCustomizations]);

  const swapSkillCardIds = useCallback((indexA, indexB) => {
    setSkillCardIdGroups((cur) => {
      const skillCardIds = [].concat(...cur);
      const temp = skillCardIds[indexA];
      skillCardIds[indexA] = skillCardIds[indexB];
      skillCardIds[indexB] = temp;
      let chunks = [];
      for (let i = 0; i < skillCardIds.length; i += 6) {
        chunks.push(skillCardIds.slice(i, i + 6));
      }
      return chunks;
    });

    setCustomizationGroups((cur) => {
      const curCustomizations = [].concat(...cur);
      const temp = curCustomizations[indexA];
      curCustomizations[indexA] = curCustomizations[indexB];
      curCustomizations[indexB] = temp;
      let chunks = [];
      for (let i = 0; i < curCustomizations.length; i += 6) {
        chunks.push(curCustomizations.slice(i, i + 6));
      }
      return chunks;
    });
  }, []);

  const insertSkillCardIdGroup = useCallback((groupIndex) => {
    setSkillCardIdGroups((cur) => {
      const updatedSkillCardIds = [...cur];
      updatedSkillCardIds.splice(groupIndex, 0, [0, 0, 0, 0, 0, 0]);
      return updatedSkillCardIds;
    });
    setCustomizationGroups((cur) => {
      const updatedCustomizations = [...cur];
      updatedCustomizations.splice(groupIndex, 0, []);
      return updatedCustomizations;
    });
  }, []);

  const deleteSkillCardIdGroup = useCallback((groupIndex) => {
    setSkillCardIdGroups((cur) => {
      const updatedSkillCardIds = [...cur];
      updatedSkillCardIds.splice(groupIndex, 1);
      return updatedSkillCardIds;
    });
    setCustomizationGroups((cur) => {
      const updatedCustomizations = [...cur];
      updatedCustomizations.splice(groupIndex, 1);
      return updatedCustomizations;
    });
  }, []);

  const swapSkillCardIdGroups = useCallback((groupIndexA, groupIndexB) => {
    setSkillCardIdGroups((cur) => {
      const updatedSkillCardIds = [...cur];
      const temp = updatedSkillCardIds[groupIndexA];
      updatedSkillCardIds[groupIndexA] = updatedSkillCardIds[groupIndexB];
      updatedSkillCardIds[groupIndexB] = temp;
      return updatedSkillCardIds;
    });
    setCustomizationGroups((cur) => {
      const updatedCustomizations = [...cur];
      const temp = updatedCustomizations[groupIndexA];
      updatedCustomizations[groupIndexA] = updatedCustomizations[groupIndexB];
      updatedCustomizations[groupIndexB] = temp;
      return updatedCustomizations;
    });
  }, []);

  const selectStage = useCallback((stageId, customStage) => {
    const hasDefaultParams = getDefaultParams(stageRef.current).every(
      (p, i) => p == paramsRef.current[i],
    );
    setStageId(stageId);
    setCustomStage(customStage);
    if (hasDefaultParams) {
      setParams(getDefaultParams(getStage(stageId, customStage)));
    }
  }, []);

  const setMemory = useCallback((memory, index) => {
    const stage = stageRef.current;
    const multiplier = stage.type !== "linkContest" && index ? 0.2 : 1;
    const applied = setMemorySlot(
      { params: paramsRef.current, slots: memorySlotsRef.current },
      index,
      memory.params,
      multiplier,
    );

    setMemorySlots(applied.slots);
    setParams(applied.params);
    if (index == 0) {
      setPItemIds(memory.pItemIds);
    }
    setSkillCardIdGroups((cur) => {
      const next = [...cur];
      next[index] = memory.skillCardIds;
      return next;
    });
    setCustomizationGroups((cur) => {
      const next = [...cur];
      next[index] = memory.customizations || [];
      return next;
    });
  }, []);

  const actions = useMemo(
    () => ({
      setLoadout,
      setMemory,
      selectStage,
      setSupportBonus,
      setParams,
      replacePItemId,
      swapPItemIds,
      replaceSkillCardId,
      swapSkillCardIds,
      replaceCustomizations,
      clear,
      insertSkillCardIdGroup,
      deleteSkillCardIdGroup,
      swapSkillCardIdGroups,
      setLoadouts,
      setCurrentLoadoutIndex,
    }),
    [
      setLoadout,
      setMemory,
      selectStage,
      replacePItemId,
      swapPItemIds,
      replaceSkillCardId,
      swapSkillCardIds,
      replaceCustomizations,
      clear,
      insertSkillCardIdGroup,
      deleteSkillCardIdGroup,
      swapSkillCardIdGroups,
    ]
  );

  const value = useMemo(
    () => ({
      ...actions,
      loadout,
      stage,
      simulatorUrl,
      loadouts,
      currentLoadoutIndex,
    }),
    [actions, loadout, stage, simulatorUrl, loadouts, currentLoadoutIndex]
  );

  return (
    <LoadoutActionsContext.Provider value={actions}>
      <LoadoutContext.Provider value={value}>
        {children}
      </LoadoutContext.Provider>
    </LoadoutActionsContext.Provider>
  );
}

export default LoadoutContext;
