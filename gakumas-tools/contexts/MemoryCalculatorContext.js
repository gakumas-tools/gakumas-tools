"use client";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SkillCards } from "gakumas-data";
import {
  loadMemoryCalculatorState,
  saveMemoryCalculatorState,
} from "@/utils/memoryCalculatorStorage";
import { getOtherVersionId } from "@/utils/upgrades";

const MemoryCalculatorContext = createContext();

export function MemoryCalculatorContextProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [targetSkillCardIds, _setTargetSkillCardIds] = useState([0]);
  const [alternateSkillCardIds, _setAlternateSkillCardIds] = useState([]);
  const [targetNegations, _setTargetNegations] = useState([]);
  const [acquiredSkillCardIds, _setAcquiredSkillCardIds] = useState([0]);
  const [rank, setRank] = useState("SS+");

  useEffect(() => {
    const data = loadMemoryCalculatorState();
    if (data.targetSkillCardIds) _setTargetSkillCardIds(data.targetSkillCardIds);
    if (data.alternateSkillCardIds) _setAlternateSkillCardIds(data.alternateSkillCardIds);
    if (data.targetNegations) _setTargetNegations(data.targetNegations);
    if (data.acquiredSkillCardIds) _setAcquiredSkillCardIds(data.acquiredSkillCardIds);
    if (data.rank) setRank(data.rank);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveMemoryCalculatorState({
      targetSkillCardIds,
      alternateSkillCardIds,
      targetNegations,
      acquiredSkillCardIds,
      rank,
    });
  }, [
    loaded,
    targetSkillCardIds,
    alternateSkillCardIds,
    targetNegations,
    acquiredSkillCardIds,
    rank,
  ]);

  const setTargetSkillCardIds = useCallback((callback) => {
    let removedIndices = [];
    _setTargetSkillCardIds((cur) => {
      const updated = callback(cur);
      return updated
        .filter((id, idx) => {
          if (!id) removedIndices.push(idx);
          return id;
        })
        .concat(0);
    });

    // If target skill card is removed, also remove the associated alternates and negations
    _setAlternateSkillCardIds((cur) => {
      const updated = JSON.parse(JSON.stringify(cur));
      removedIndices.forEach((idx) => (updated[idx] = 0));
      return updated.filter((alts) => alts !== 0);
    });

    _setTargetNegations((cur) => {
      const updated = [...cur];
      removedIndices.forEach((idx) => (updated[idx] = 0));
      return updated.filter((neg) => neg !== 0);
    });
  }, []);

  const setAlternateSkillCardIds = useCallback((callback) => {
    _setAlternateSkillCardIds((cur) => {
      let arr = [];
      for (let i = 0; i < cur.length; i++) {
        arr = arr.concat(Array.from({ ...cur[i], length: 10 }));
      }

      const updatedArr = callback(arr);

      let updatedObj = [];
      for (let i = 0; i < cur.length; i++) {
        const chunk = updatedArr.slice(i * 10, i * 10 + 10);
        if (chunk.some((id) => id != null)) {
          updatedObj[i] = updatedArr
            .slice(i * 10, i * 10 + 10)
            .filter((id) => id);
        } else {
          updatedObj[i] = null;
        }
      }
      return updatedObj;
    });
  }, []);

  const addAlternateSkillCards = useCallback(
    (index) => {
      const updatedAlternateSkillCardIds = JSON.parse(
        JSON.stringify(alternateSkillCardIds)
      );
      if (alternateSkillCardIds[index]?.length) {
        updatedAlternateSkillCardIds[index].push(0);
      } else {
        // Add the opposite upgraded version of the card by default
        let targetSkillCard = SkillCards.getById(targetSkillCardIds[index]);
        const otherId =
          targetSkillCard?.rarity == "T"
            ? null
            : getOtherVersionId(SkillCards, targetSkillCard);
        updatedAlternateSkillCardIds[index] = [otherId ?? 0];
      }
      _setAlternateSkillCardIds(updatedAlternateSkillCardIds);
    },
    [alternateSkillCardIds, targetSkillCardIds]
  );

  const setNegation = useCallback(
    (index, value) => {
      const updatedNegations = [...targetNegations];
      updatedNegations[index] = value;
      _setTargetNegations(updatedNegations);
    },
    [targetNegations]
  );

  const setAcquiredSkillCardIds = useCallback((callback) => {
    _setAcquiredSkillCardIds((cur) => {
      return callback(cur)
        .filter((id) => id)
        .concat(0);
    });
  }, []);

  const replaceTargetCardId = useCallback(
    (index, cardId) => {
      setTargetSkillCardIds((cur) => {
        const next = [...cur];
        next[index] = cardId;
        return next;
      });
    },
    [setTargetSkillCardIds]
  );

  const replaceAlternateCardId = useCallback(
    (index, cardId) => {
      setAlternateSkillCardIds((cur) => {
        const next = [...cur];
        next[index] = cardId;
        return next;
      });
    },
    [setAlternateSkillCardIds]
  );

  const replaceAcquiredCardId = useCallback(
    (index, cardId) => {
      setAcquiredSkillCardIds((cur) => {
        const next = [...cur];
        next[index] = cardId;
        return next;
      });
    },
    [setAcquiredSkillCardIds]
  );

  const clearTargetCardIds = useCallback(() => {
    _setTargetSkillCardIds([0]);
    _setAlternateSkillCardIds([]);
    _setTargetNegations([]);
  }, []);

  const clearAcquiredCardIds = useCallback(() => {
    _setAcquiredSkillCardIds([0]);
  }, []);

  const value = useMemo(
    () => ({
      targetSkillCardIds,
      setTargetSkillCardIds,
      alternateSkillCardIds,
      acquiredSkillCardIds,
      setAcquiredSkillCardIds,
      targetNegations,
      addAlternateSkillCards,
      setNegation,
      replaceTargetCardId,
      replaceAlternateCardId,
      replaceAcquiredCardId,
      clearTargetCardIds,
      clearAcquiredCardIds,
      rank,
      setRank,
    }),
    [
      targetSkillCardIds,
      setTargetSkillCardIds,
      alternateSkillCardIds,
      acquiredSkillCardIds,
      setAcquiredSkillCardIds,
      targetNegations,
      addAlternateSkillCards,
      setNegation,
      replaceTargetCardId,
      replaceAlternateCardId,
      replaceAcquiredCardId,
      clearTargetCardIds,
      clearAcquiredCardIds,
      rank,
    ]
  );

  return (
    <MemoryCalculatorContext.Provider value={value}>
      {children}
    </MemoryCalculatorContext.Provider>
  );
}

export default MemoryCalculatorContext;
