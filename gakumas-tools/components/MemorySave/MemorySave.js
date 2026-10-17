import { memo, useContext } from "react";
import { useSession, signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { FaCheck, FaTriangleExclamation } from "react-icons/fa6";
import Button from "@/components/Button";
import Loader from "@/components/Loader";
import MemoryContext from "@/contexts/MemoryContext";
import styles from "./MemorySave.module.scss";

function MemorySave() {
  const t = useTranslations("MemorySave");

  const { status } = useSession();
  const { id, save, saveState, stashDraft } = useContext(MemoryContext);

  function signInToSave() {
    stashDraft();
    signIn("discord");
  }

  return (
    <div className={styles.save}>
      {status == "unauthenticated" && (
        <Button style="primary" onClick={signInToSave}>
          {t("signInToSave")}
        </Button>
      )}

      {status == "authenticated" && (
        <>
          <Button
            style="primary"
            onClick={() => save(false)}
            disabled={saveState == "saving"}
          >
            {t("save")}
          </Button>
          {id && (
            <Button
              style="primary"
              onClick={() => save(true)}
              disabled={saveState == "saving"}
            >
              {t("saveAsNew")}
            </Button>
          )}
        </>
      )}

      <div className={styles.statusSlot}>
        {saveState == "saving" && (
          <span className={styles.status}>
            <Loader />
            {t("saving")}
          </span>
        )}
        {saveState == "saved" && (
          <span className={styles.saved} role="status">
            <FaCheck />
            {t("saved")}
          </span>
        )}
        {saveState == "error" && (
          <span className={styles.error} role="alert">
            <FaTriangleExclamation />
            {t("saveFailed")}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(MemorySave);
