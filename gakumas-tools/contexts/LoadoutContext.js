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
import {
  fixCustomizationGroups,
  getDefaultParams,
  getSimulatorUrl,
  getStage,
  deserializePDrinkIds,
  knownStageId,
  produceExamIdOf,
} from "gakumas-loadout";
import { usePathname } from "@/i18n/routing";
import LoadoutUrlContext from "@/contexts/LoadoutUrlContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import {
  getMemorySlotCustomizations,
  getMemorySlotSkillCardIds,
  setMemorySlot,
} from "@/utils/memorySlots";
import { synchronizeLinkLoadouts } from "@/utils/linkLoadouts";

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
  const [enterPercents, setEnterPercents] = useState(
    !!initialLoadout.enterPercents
  );
  // A custom stage, or a produce exam's turn order ({ turnTypes }).
  const [customStage, setCustomStage] = useState(
    produceExamIdOf(initialLoadout.stageId) ? initialLoadout.customStage : null,
  );
  const [supportBonus, setSupportBonus] = useState(initialLoadout.supportBonus);
  const [params, setParams] = useState(initialLoadout.params);
  const [pItemIds, setPItemIds] = useState(initialLoadout.pItemIds);
  // Held only in produce exams; kept while another stage is picked so going
  // back to the exam restores them, but never passed to other stages.
  const [pDrinkIds, setPDrinkIds] = useState(() =>
    deserializePDrinkIds(initialLoadout.pDrinkIds?.join("-")),
  );
  const [skillCardIdGroups, setSkillCardIdGroups] = useState(() =>
    initialLoadout.skillCardIdGroups.map((skillCardIds) =>
      getMemorySlotSkillCardIds({ skillCardIds }),
    ),
  );
  const [customizationGroups, setCustomizationGroups] = useState(() =>
    fixCustomizationGroups(
      skillCardIdGroups,
      initialLoadout.customizationGroups,
    ),
  );

  const stage = useMemo(
    () => getStage(stageId, customStage),
    [stageId, customStage],
  );

  const loadout = useMemo(
    () => ({
      stageId,
      enterPercents,
      customStage:
        stageId == "custom"
          ? customStage
          : produceExamIdOf(stageId)
            ? { turnTypes: stage.turnTypes }
            : {},
      supportBonus,
      params,
      pItemIds,
      pDrinkIds: produceExamIdOf(stageId) ? pDrinkIds : [0, 0, 0],
      skillCardIdGroups,
      customizationGroups,
    }),
    [
      stageId,
      enterPercents,
      customStage,
      stage,
      supportBonus,
      params,
      pItemIds,
      pDrinkIds,
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
    // Phase tabs set their own index right after this.
    setCurrentLoadoutIndex(0);
    setStageId(knownStageId(loadout.stageId));
    setEnterPercents(!!loadout.enterPercents);
    if (loadout.stageId == "custom") {
      let custom = { ...loadout.customStage };
      if (Array.isArray(custom.firstTurns)) {
        const length = custom.firstTurns.length;
        custom.firstTurns = custom.firstTurns.reduce((acc, cur) => {
          acc[cur] = 1 / length;
          return acc;
        }, {});
      }
      setCustomStage(custom);
    } else if (produceExamIdOf(loadout.stageId)) {
      setCustomStage({ turnTypes: loadout.customStage?.turnTypes });
    }
    setSupportBonus(loadout.supportBonus);
    setMemorySlots([null, null]);
    setParams(loadout.params);
    setPItemIds(loadout.pItemIds);
    if (produceExamIdOf(loadout.stageId)) {
      setPDrinkIds(deserializePDrinkIds(loadout.pDrinkIds?.join("-")));
    }
    const groups = loadout.skillCardIdGroups.map((skillCardIds) =>
      getMemorySlotSkillCardIds({ skillCardIds }),
    );
    setSkillCardIdGroups(groups);
    setCustomizationGroups(
      fixCustomizationGroups(groups, loadout.customizationGroups),
    );
  }, []);

  useEffect(() => {
    if (["sense", "logic", "anomaly"].includes(stage.plan)) {
      setPlan(stage.plan);
    }
  }, [stage]);

  // Update browser URL when the loadout changes
  useEffect(() => {
    if (pathname !== "/simulator") return;
    updateUrl(loadout, loadouts);
  }, [loadout, loadouts]);

  // Update link loadouts when loadout changes
  useEffect(() => {
    if (stage.type == "linkContest") {
      const phaseCount = Math.max(1, stage.linkTurnCounts.length);
      setLoadouts((cur) =>
        synchronizeLinkLoadouts(cur, loadout, currentLoadoutIndex, phaseCount)
      );
      if (currentLoadoutIndex >= phaseCount) {
        setCurrentLoadoutIndex(phaseCount - 1);
      }
    }
  }, [loadout, currentLoadoutIndex, stage]);

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
    setPDrinkIds([0, 0, 0]);
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

  const replacePDrinkId = useCallback((index, drinkId) => {
    setPDrinkIds((cur) => {
      const next = [...cur];
      next[index] = drinkId;
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
      // One entry per card slot: replaceCustomizations and swapSkillCardIds
      // index customizations as one flat list cut into groups of 6.
      updatedCustomizations.splice(
        groupIndex,
        0,
        Array.from({ length: 6 }, () => ({})),
      );
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

  // The turn order a produce exam shows in game, one entry per turn.
  const setTurnType = useCallback((turnIndex, type) => {
    const turnTypes = [...stageRef.current.turnTypes];
    turnTypes[turnIndex] = type;
    setCustomStage({ turnTypes });
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
      next[index] = getMemorySlotSkillCardIds(memory);
      return next;
    });
    setCustomizationGroups((cur) => {
      const next = [...cur];
      next[index] = getMemorySlotCustomizations(memory);
      return next;
    });
  }, []);

  const actions = useMemo(
    () => ({
      setLoadout,
      setMemory,
      selectStage,
      setTurnType,
      setSupportBonus,
      setEnterPercents,
      setParams,
      replacePItemId,
      replacePDrinkId,
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
      setTurnType,
      replacePItemId,
      replacePDrinkId,
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
