"use client";
import { memo, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import MemoryEditorModal from "@/components/MemoryEditorModal";
import DataContext from "@/contexts/DataContext";
import MemoryContext from "@/contexts/MemoryContext";
import ModalContext from "@/contexts/ModalContext";
import SearchContext from "@/contexts/SearchContext";
import { calculateContestPower } from "@/utils/contestPower";
import { takeMemoryDraft } from "@/utils/memoryDraft";
import {
  compareFilteredMemories,
  compareUnfilteredMemories,
  getSearchScore,
} from "@/utils/sort";
import MemoriesHeader from "./MemoriesHeader";
import MemoriesList from "./MemoriesList";
import styles from "./Memories.module.scss";

function Memories() {
  const t = useTranslations("Memories");
  const { status } = useSession();
  const { memories, memoriesError, fetchMemories } = useContext(DataContext);
  const { restoreDraft } = useContext(MemoryContext);
  const { setModal } = useContext(ModalContext);
  const { pItemIds, skillCardIds } = useContext(SearchContext);
  const [action, setAction] = useState(null);
  const [selectedMemories, setSelectedMemories] = useState({});

  useEffect(() => {
    if (status == "authenticated" && !memories.length) {
      fetchMemories();
    }
  }, [status]);

  useEffect(() => {
    if (restoreDraft()) {
      setModal(<MemoryEditorModal />);
    }
  }, []);

  useEffect(() => {
    const dropDraftOnBackForwardRestore = (event) => {
      if (event.persisted) takeMemoryDraft();
    };
    window.addEventListener("pageshow", dropDraftOnBackForwardRestore);
    return () =>
      window.removeEventListener("pageshow", dropDraftOnBackForwardRestore);
  }, []);

  const hasSearchQuery = pItemIds.some((i) => i) || skillCardIds.some((i) => i);
  const filteredMemories = useMemo(
    () =>
      memories
        .map((memory) => {
          memory.searchScore = hasSearchQuery
            ? getSearchScore(memory, pItemIds, skillCardIds)
            : 1;
          memory.contestPower = calculateContestPower(
            memory.params,
            memory.pItemIds,
            memory.skillCardIds,
            memory.customizations
          );
          return memory;
        })
        .filter((memory) => memory.searchScore)
        .sort(
          hasSearchQuery ? compareFilteredMemories : compareUnfilteredMemories
        ),
    [memories, pItemIds, skillCardIds, hasSearchQuery]
  );

  return (
    <div className={styles.memories}>
      <MemoriesHeader
        numMemories={filteredMemories.length}
        action={action}
        setAction={setAction}
        selectedMemories={selectedMemories}
        setSelectedMemories={setSelectedMemories}
      />
      {memoriesError && (
        <Alert variant="danger" className={styles.alert}>
          <div className={styles.alertContent}>
            {t(`${memoriesError}Error`)}
            {memoriesError == "load" && (
              <Button size="sm" onClick={fetchMemories}>
                {t("retry")}
              </Button>
            )}
          </div>
        </Alert>
      )}
      <MemoriesList
        memories={filteredMemories}
        filtered={memories.length > 0}
        deleting={action == "delete"}
        picking={action == "pick"}
        selectedMemories={selectedMemories}
        setSelectedMemories={setSelectedMemories}
      />
    </div>
  );
}

export default memo(Memories);
