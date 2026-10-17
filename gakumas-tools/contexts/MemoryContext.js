"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import DataContext from "@/contexts/DataContext";
import { fixCustomizations } from "@/utils/customizations";
import { stashMemoryDraft, takeMemoryDraft } from "@/utils/memoryDraft";

const MemoryContext = createContext();

export function MemoryContextProvider({ children }) {
  const [saveState, setSaveState] = useState("unsaved");
  const [id, setId] = useState(null);
  const [name, setName] = useState(null);
  const [pIdolId, setPIdolId] = useState(null);
  const [params, setParams] = useState([null, null, null, null]);
  const [pItemIds, setPItemIds] = useState([0, 0, 0, 0]);
  const [skillCardIds, setSkillCardIds] = useState([0, 0, 0, 0, 0, 0]);
  const [customizations, setCustomizations] = useState([
    {},
    {},
    {},
    {},
    {},
    {},
  ]);
  const { fetchMemories } = useContext(DataContext);

  useEffect(() => {
    // If fewer than 4 pItems, pad with 0s
    if (pItemIds.length < 4) {
      setPItemIds((cur) => cur.concat(new Array(4 - cur.length).fill(0)));
    }
  }, [pItemIds]);

  useEffect(() => {
    setSaveState("unsaved");
  }, [name, pIdolId, params, pItemIds, skillCardIds, customizations]);

  const save = useCallback(
    async (asNew) => {
      setSaveState("saving");
      const memory = {
        name,
        pIdolId,
        params,
        pItemIds,
        skillCardIds,
        customizations,
      };
      const isNew = asNew || !id;
      const url = isNew ? "/api/memory" : `/api/memory/${id}`;
      const method = isNew ? "POST" : "PUT";
      const body = isNew ? { memories: [memory] } : memory;
      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw new Error(`${method} ${url} failed with ${response.status}`);
        }
        if (isNew) {
          const { ids } = await response.json();
          setId(ids[0]);
        }
        setSaveState("saved");
      } catch (error) {
        console.error(error);
        setSaveState("error");
        return;
      }
      fetchMemories();
    },
    [
      id,
      name,
      pIdolId,
      params,
      pItemIds,
      skillCardIds,
      customizations,
      fetchMemories,
    ]
  );

  const setAll = useCallback((memory) => {
    setId(memory._id || null);
    setName(memory.name || null);
    setPIdolId(memory.pIdolId || null);
    setParams(memory.params || [null, null, null, null]);
    setPItemIds(memory.pItemIds || [0, 0, 0, 0]);
    setSkillCardIds(memory.skillCardIds || [0, 0, 0, 0, 0, 0]);
    if (memory.customizations) {
      setCustomizations(memory.customizations.map(fixCustomizations));
    } else {
      setCustomizations([{}, {}, {}, {}, {}, {}]);
    }
  }, []);

  const stashDraft = useCallback(() => {
    stashMemoryDraft({
      _id: id,
      name,
      pIdolId,
      params,
      pItemIds,
      skillCardIds,
      customizations,
    });
  }, [id, name, pIdolId, params, pItemIds, skillCardIds, customizations]);

  const restoreDraft = useCallback(() => {
    const draft = takeMemoryDraft();
    if (!draft) return false;
    setAll(draft);
    return true;
  }, [setAll]);

  const replacePItemId = useCallback((index, itemId) => {
    setPItemIds((cur) => {
      const next = [...cur];
      next[index] = itemId;
      return next;
    });
  }, []);

  const replaceSkillCardId = useCallback((index, cardId) => {
    setSkillCardIds((cur) => {
      const next = [...cur];
      next[index] = cardId;
      return next;
    });
  }, []);

  const replaceCustomizations = useCallback((index, c11n) => {
    setCustomizations((cur) => {
      const next = [...cur];
      next[index] = c11n;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      saveState,
      id,
      name,
      setName,
      pIdolId,
      setPIdolId,
      params,
      setParams,
      pItemIds,
      skillCardIds,
      customizations,
      replacePItemId,
      replaceSkillCardId,
      replaceCustomizations,
      setAll,
      save,
      stashDraft,
      restoreDraft,
    }),
    [
      saveState,
      id,
      name,
      pIdolId,
      params,
      pItemIds,
      skillCardIds,
      customizations,
      replacePItemId,
      replaceSkillCardId,
      replaceCustomizations,
      setAll,
      save,
      stashDraft,
      restoreDraft,
    ]
  );

  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}

export default MemoryContext;
