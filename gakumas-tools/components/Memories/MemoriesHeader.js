import { memo, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  FaCircleXmark,
  FaFileImport,
  FaFilm,
  FaMagnifyingGlass,
  FaPen,
  FaRegTrashCan,
} from "react-icons/fa6";
import Button from "@/components/Button";
import Collapse from "@/components/Collapse";
import ConfirmModal from "@/components/ConfirmModal";
import IconButton from "@/components/IconButton";
import MemoryEditorModal from "@/components/MemoryEditorModal";
import ModalLoading from "@/components/Modal/ModalLoading";
import StagePItems from "@/components/StagePItems";
import StageSkillCards from "@/components/StageSkillCards";
import DataContext from "@/contexts/DataContext";
import MemoryContext from "@/contexts/MemoryContext";
import ModalContext from "@/contexts/ModalContext";
import SearchContext from "@/contexts/SearchContext";
import c from "@/utils/classNames";
import styles from "./Memories.module.scss";

const MemoryImporterModal = dynamic(
  () => import("@/components/MemoryImporterModal"),
  { ssr: false, loading: ModalLoading }
);

function Layer({ shown, home, className, children }) {
  return (
    <div
      className={c(
        styles.layer,
        home && styles.home,
        shown && styles.shown,
        className
      )}
      inert={!shown}
    >
      {children}
    </div>
  );
}

function MemoriesHeader({
  numMemories,
  action,
  setAction,
  selectedMemories,
  setSelectedMemories,
}) {
  const t = useTranslations("MemoriesHeader");

  const { status } = useSession();
  const { uploadMemories, deleteMemories, memoriesLoading } =
    useContext(DataContext);
  const { setAll } = useContext(MemoryContext);
  const { setModal } = useContext(ModalContext);
  const { pItemIds, skillCardIds, replacePItemId, replaceSkillCardId } =
    useContext(SearchContext);

  const [shownCount, setShownCount] = useState(numMemories);
  const [countBeats, setCountBeats] = useState(0);
  if (numMemories !== shownCount) {
    setShownCount(numMemories);
    setCountBeats(countBeats + 1);
  }

  const selectedMemoryIds = useMemo(
    () => Object.keys(selectedMemories).filter((s) => selectedMemories[s]),
    [selectedMemories]
  );

  return (
    <div className={styles.header}>
      <div className={styles.toolbar}>
        <div className={styles.layers}>
          <Layer shown={!action} home>
            <IconButton
              icon={FaMagnifyingGlass}
              onClick={() => setAction("search")}
              ariaLabel={t("search")}
            />
            <IconButton
              icon={FaPen}
              onClick={() => {
                setAll({});
                setModal(<MemoryEditorModal />);
              }}
              ariaLabel={t("create")}
            />
            {status == "authenticated" && (
              <IconButton
                icon={FaFileImport}
                onClick={() =>
                  setModal(<MemoryImporterModal onSuccess={uploadMemories} />)
                }
                ariaLabel={t("import")}
              />
            )}
            <IconButton
              icon={FaRegTrashCan}
              tone="danger"
              onClick={() => setAction("delete")}
              ariaLabel={t("delete")}
            />
          </Layer>

          <Layer shown={action == "search"}>
            <IconButton
              icon={FaCircleXmark}
              onClick={() => setAction(null)}
              ariaLabel={t("cancel")}
            />
            <span className={styles.modeLabel}>
              <FaMagnifyingGlass aria-hidden="true" />
              {t("search")}
            </span>
          </Layer>

          <Layer shown={action == "delete"}>
            <IconButton
              icon={FaCircleXmark}
              onClick={() => {
                setAction(null);
                setSelectedMemories({});
              }}
              ariaLabel={t("cancel")}
            />
            <span className={styles.modeLabel} aria-live="polite">
              {t("selected", { num: selectedMemoryIds.length })}
            </span>
          </Layer>
        </div>

        <div className={c(styles.layers, styles.end)}>
          <Layer shown={action != "delete" && !memoriesLoading} home>
            <span
              className={c(
                styles.count,
                countBeats > 0 &&
                  (countBeats % 2 ? styles.beatA : styles.beatB)
              )}
            >
              <FaFilm aria-hidden="true" />
              {numMemories}
            </span>
          </Layer>

          <Layer shown={action == "delete"}>
            <Button
              style="red"
              size="sm"
              onClick={() =>
                setModal(
                  <ConfirmModal
                    message={t("confirmDelete", {
                      num: selectedMemoryIds.length,
                    })}
                    confirmLabel={t("delete")}
                    danger
                    onConfirm={() => {
                      deleteMemories(selectedMemoryIds);
                      setSelectedMemories({});
                    }}
                  />
                )
              }
              disabled={!selectedMemoryIds.length}
            >
              <FaRegTrashCan aria-hidden="true" />
              {t("delete")}
            </Button>
          </Layer>
        </div>
      </div>

      <Collapse open={action == "search"}>
        <div className={styles.search}>
          <StagePItems
            pItemIds={pItemIds}
            replacePItemId={replacePItemId}
            size="small"
          />
          <StageSkillCards
            skillCardIds={skillCardIds}
            replaceSkillCardId={replaceSkillCardId}
            size="medium"
          />
        </div>
      </Collapse>
    </div>
  );
}

export default memo(MemoriesHeader);
