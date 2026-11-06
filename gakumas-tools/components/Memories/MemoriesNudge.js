import { memo, useContext } from "react";
import dynamic from "next/dynamic";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  FaDiscord,
  FaFileImport,
  FaFilm,
  FaMagnifyingGlass,
  FaPen,
} from "react-icons/fa6";
import Button from "@/components/Button";
import Loader from "@/components/Loader";
import MemoryEditorModal from "@/components/MemoryEditorModal";
import ModalLoading from "@/components/Modal/ModalLoading";
import DataContext from "@/contexts/DataContext";
import MemoryContext from "@/contexts/MemoryContext";
import ModalContext from "@/contexts/ModalContext";
import styles from "./Memories.module.scss";

const MemoryImporterModal = dynamic(
  () => import("@/components/MemoryImporterModal"),
  { ssr: false, loading: ModalLoading }
);

function MemoriesNudge({ filtered }) {
  const t = useTranslations("MemoriesNudge");

  const { status } = useSession();
  const { uploadMemories, memoriesLoading } = useContext(DataContext);
  const { setAll } = useContext(MemoryContext);
  const { setModal } = useContext(ModalContext);

  if (filtered) {
    return (
      <div className={styles.nudge}>
        <span className={styles.nudgeIcon} aria-hidden="true">
          <FaMagnifyingGlass />
        </span>
        <p className={styles.nudgeText}>{t("noMatches")}</p>
      </div>
    );
  }

  if (status == "loading" || memoriesLoading) {
    return (
      <div className={styles.nudge} aria-busy="true">
        <Loader size="large" />
      </div>
    );
  }

  return (
    <div className={styles.nudge}>
      <span className={styles.nudgeIcon} aria-hidden="true">
        <FaFilm />
      </span>
      {status == "unauthenticated" && (
        <>
          <p className={styles.nudgeText}>{t("signInHint")}</p>
          <div className={styles.nudgeActions}>
            <Button style="primary" onClick={() => signIn("discord")}>
              <FaDiscord /> {t("signIn")}
            </Button>
            <Button
              onClick={() => {
                setAll({});
                setModal(<MemoryEditorModal />);
              }}
            >
              <FaPen /> {t("create")}
            </Button>
          </div>
        </>
      )}
      {status == "authenticated" && (
        <>
          <p className={styles.nudgeText}>{t("empty")}</p>
          <Button
            style="primary"
            onClick={() =>
              setModal(<MemoryImporterModal onSuccess={uploadMemories} />)
            }
          >
            <FaFileImport /> {t("import")}
          </Button>
        </>
      )}
    </div>
  );
}

export default memo(MemoriesNudge);
