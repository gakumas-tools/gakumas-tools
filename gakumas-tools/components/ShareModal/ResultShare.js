"use client";
import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { signIn, useSession } from "next-auth/react";
import { FaXTwitter } from "react-icons/fa6";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import Input from "@/components/Input";
import ModalContext from "@/contexts/ModalContext";
import { Link } from "@/i18n/routing";
import { MAX_NAME_LENGTH } from "@/utils/apiValidation";
import { sharedRunUrl } from "@/utils/sharedRunUrl";
import LinkRow, { tweet } from "./LinkRow";
import styles from "./ShareModal.module.scss";

// The result's part of Share: saves the run, makes its link and, if the box
// stays ticked, lists it on the stage's shared runs. The simulator's
// functions come in as props, since the modal is drawn outside its providers.
export default function ResultShare({
  run,
  listable,
  saveRun,
  shareSaved,
  listRun,
}) {
  const t = useTranslations("ShareModal");
  const tRun = useTranslations("SharedRun");
  const { closeModal } = useContext(ModalContext);
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [list, setList] = useState(listable);
  const [step, setStep] = useState("form");
  const [shared, setShared] = useState(null);

  async function share() {
    if (step == "busy") return;
    setStep("busy");
    try {
      const trimmed = name.trim() || null;
      const id =
        listable && list
          ? await listRun(run, trimmed)
          : await shareSaved(await saveRun(run, trimmed));
      setShared({ url: sharedRunUrl(id), listed: listable && list });
      setStep("done");
    } catch (err) {
      console.error(err);
      setStep("error");
    }
  }

  let content;
  if (status == "loading") {
    content = null;
  } else if (status != "authenticated") {
    content = (
      <>
        <p className={styles.help}>{t("signInToShareResult")}</p>
        <Button fill onClick={() => signIn("discord")}>
          {t("signIn")}
        </Button>
      </>
    );
  } else if (step == "done") {
    content = (
      <>
        <p className={styles.help}>
          {t(shared.listed ? "listedNote" : "sharedNote")}
        </p>
        <LinkRow url={shared.url} />
        <Button fill onClick={() => tweet(shared.url)}>
          <FaXTwitter />
          {t("xResult")}
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
      </>
    );
  } else {
    const busy = step == "busy";
    content = (
      <>
        <p className={styles.help}>{t("resultHelp")}</p>
        <Input
          type="text"
          className={styles.name}
          value={name}
          placeholder={t("namePlaceholder")}
          maxLength={MAX_NAME_LENGTH}
          disabled={busy}
          onChange={setName}
          onKeyDown={(e) => {
            if (e.key == "Enter") share();
          }}
        />
        {listable && (
          <Checkbox
            checked={list}
            label={t("listOnStage")}
            onChange={(v) => !busy && setList(v)}
          />
        )}
        {session?.user?.name && (
          <p className={styles.shownAs}>
            {tRun("shownAs", { name: session.user.name })}
          </p>
        )}
        {step == "error" && <p className={styles.error}>{t("failed")}</p>}
        <Button style="primary" fill disabled={busy} onClick={share}>
          {t(busy ? "making" : "makeLink")}
        </Button>
      </>
    );
  }

  return (
    <div className={styles.result}>
      <h4>{t("resultTitle")}</h4>
      {content}
    </div>
  );
}
