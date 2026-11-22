"use client";
import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { FaCheck, FaRegCopy } from "react-icons/fa6";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import ModalContext from "@/contexts/ModalContext";
import { Link } from "@/i18n/routing";
import { MAX_NAME_LENGTH } from "@/utils/apiValidation";
import { sharedRunUrl } from "@/utils/sharedRunUrl";
import styles from "./ShareRunModal.module.scss";

// Shares the result on screen in one step: saves it, makes its link and,
// if the player leaves the box ticked, lists it on the stage's shared runs.
// The context's functions come in as props, since the modal is drawn
// outside the simulator's providers.
export default function ShareRunModal({
  run,
  listable,
  saveRun,
  shareSaved,
  listRun,
}) {
  const t = useTranslations("ShareRunModal");
  const { closeModal } = useContext(ModalContext);
  const [name, setName] = useState("");
  const [list, setList] = useState(listable);
  const [step, setStep] = useState("form");
  const [shared, setShared] = useState(null);
  const [copied, setCopied] = useState(false);

  async function share() {
    if (step == "busy") return;
    setStep("busy");
    try {
      const trimmed = name.trim() || null;
      const id =
        listable && list
          ? await listRun(run, trimmed)
          : await shareSaved(await saveRun(run, trimmed));
      setShared({ id, url: sharedRunUrl(id), listed: listable && list });
      setStep("done");
    } catch (err) {
      console.error(err);
      setStep("error");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shared.url);
      setCopied(true);
    } catch {
      window.prompt(t("copyThisLink"), shared.url);
    }
  }

  if (step == "done") {
    return (
      <Modal size="small">
        <h3>{t(shared.listed ? "listedTitle" : "sharedTitle")}</h3>
        <p className={styles.note}>
          {t(shared.listed ? "listedNote" : "sharedNote")}
        </p>
        <input className={styles.url} type="text" value={shared.url} readOnly />
        <div className={styles.buttons}>
          <Button style="primary" fill onClick={copy}>
            {copied ? <FaCheck /> : <FaRegCopy />}
            {t(copied ? "copied" : "copyLink")}
          </Button>
          {shared.listed && (
            <Link
              className={styles.seeAll}
              href={{
                pathname: "/shared",
                query: { stage: String(run.loadout.stageId) },
              }}
              onClick={closeModal}
            >
              {t("seeOthers")}
            </Link>
          )}
        </div>
      </Modal>
    );
  }

  const busy = step == "busy";
  return (
    <Modal size="small" dismissable={!busy}>
      <h3>{t("title")}</h3>
      <p className={styles.note}>{t("hint")}</p>
      <input
        className={styles.name}
        type="text"
        value={name}
        placeholder={t("namePlaceholder")}
        maxLength={MAX_NAME_LENGTH}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key == "Enter") share();
        }}
      />
      {listable && (
        <label className={styles.list}>
          <input
            type="checkbox"
            checked={list}
            disabled={busy}
            onChange={(e) => setList(e.target.checked)}
          />
          {t("listOnStage")}
        </label>
      )}
      {step == "error" && <p className={styles.error}>{t("failed")}</p>}
      <div className={styles.buttons}>
        <Button style="default" fill disabled={busy} onClick={closeModal}>
          {t("cancel")}
        </Button>
        <Button style="primary" fill disabled={busy} onClick={share}>
          {t(busy ? "sharing" : "share")}
        </Button>
      </div>
    </Modal>
  );
}
