"use client";
import { memo, useContext, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { FaChevronDown } from "react-icons/fa6";
import { PIdols, SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import Button from "@/components/Button";
import ConfirmModal from "@/components/ConfirmModal";
import Image from "@/components/Image";
import Input from "@/components/Input";
import ModalContext from "@/contexts/ModalContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import { MAX_NAME_LENGTH } from "@/utils/apiValidation";
import { Link } from "@/i18n/routing";
import c from "@/utils/classNames";
import { getIdolName } from "@/utils/simulationRun";
import { isListableStageId, placeAmongRuns } from "@/utils/stageListing";
import styles from "./StageSharedRuns.module.scss";

// Runs other players listed for the stage being simulated, best first. Closed
// until opened, so it costs nothing unless someone looks. yourRun is the
// result on screen, if it's for this loadout: it gets a row of its own at the
// place its median would take, so a player sees where they stand, and can list
// it there (save, share and show on the stage's page) in one step.
// "Opened by N players", or nothing if no one else has opened it yet.
function openedByText(tRun, run) {
  if (!(run.openedBy > 0)) return null;
  return run.openedByMore
    ? tRun("openedByMore", { count: run.openedBy })
    : tRun("openedBy", { count: run.openedBy });
}

function StageSharedRuns({ stageId, yourRun }) {
  const t = useTranslations("StageSharedRuns");
  const tDex = useTranslations("Dex");
  const tRun = useTranslations("SharedRun");
  const [open, setOpen] = useState(false);
  const [byStage, setByStage] = useState({});
  const [failed, setFailed] = useState(false);
  const { status } = useSession();
  const { setModal } = useContext(ModalContext);
  const { listRun } = useContext(SimulationRunsContext);
  // { runId, step: "naming" | "busy" | "done" | "error", name }
  const [listing, setListing] = useState(null);

  const yourMedian = yourRun?.stats?.median;
  const yourListing = listing?.runId === yourRun?.id ? listing : null;

  const runs = byStage[stageId];

  useEffect(() => {
    if (!open || !isListableStageId(stageId) || runs) return;
    let cancelled = false;
    setFailed(false);
    fetch(`/api/share?stage=${stageId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/share failed with ${res.status}`);
        return res.json();
      })
      .then((list) => {
        if (!cancelled) setByStage((cur) => ({ ...cur, [stageId]: list }));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stageId, runs]);

  if (!isListableStageId(stageId)) return null;

  function startListing() {
    if (status !== "authenticated") {
      setModal(
        <ConfirmModal
          message={t("signInToList")}
          onConfirm={() => signIn("discord")}
        />,
      );
      return;
    }
    setListing({ runId: yourRun.id, step: "naming", name: "" });
  }

  async function submitListing() {
    if (yourListing?.step == "busy") return;
    const run = yourRun;
    const name = yourListing.name.trim() || null;
    setListing({ ...yourListing, step: "busy" });
    try {
      await listRun(run, name);
      setListing({ runId: run.id, step: "done" });
      // Fetch again, so the run shows with the stats the server simulated.
      setByStage(({ [stageId]: _, ...rest }) => rest);
    } catch (err) {
      console.error(err);
      setListing({ ...yourListing, step: "error" });
    }
  }

  const yourCard = yourRun?.derived?.signatureCardId
    ? SkillCards.getById(yourRun.derived.signatureCardId)
    : null;

  const place =
    runs && !failed && yourListing?.step != "done"
      ? placeAmongRuns(runs, yourMedian)
      : null;
  const yourRow = place && (
    <li key="yours" className={styles.yours}>
      <div className={styles.row}>
        <span className={styles.rank} />
        {yourCard ? (
          <Image
            src={gkImg(yourCard).icon}
            width={32}
            height={32}
            alt={yourCard.name}
            draggable={false}
          />
        ) : (
          <span className={styles.placeholder} />
        )}
        <span className={styles.text}>
          <span className={styles.name}>{t("yourRun")}</span>
          <span className={styles.meta}>
            {place.below
              ? t("belowTop", { count: runs.length })
              : t("place", { rank: place.rank, count: runs.length + 1 })}
          </span>
        </span>
        <span className={styles.score}>
          {Math.round(yourMedian).toLocaleString()}
        </span>
      </div>
      {!yourListing && (
        <Button
          className={styles.listYours}
          style="blue-secondary"
          size="sm"
          onClick={startListing}
        >
          {t("listYours")}
        </Button>
      )}
      {yourListing && yourListing.step != "done" && (
        <div className={styles.listForm}>
          <Input
            type="text"
            className={styles.listName}
            value={yourListing.name}
            placeholder={t("namePlaceholder")}
            maxLength={MAX_NAME_LENGTH}
            disabled={yourListing.step == "busy"}
            onChange={(name) => setListing({ ...yourListing, name })}
            onKeyDown={(e) => {
              if (e.key == "Enter") submitListing();
            }}
            autoFocus
          />
          <Button
            style="blue"
            size="sm"
            disabled={yourListing.step == "busy"}
            onClick={submitListing}
          >
            {yourListing.step == "busy" ? t("listing") : t("list")}
          </Button>
          <Button
            style="secondary"
            size="sm"
            disabled={yourListing.step == "busy"}
            onClick={() => setListing(null)}
          >
            {t("cancel")}
          </Button>
          {yourListing.step == "error" && (
            <span className={styles.error}>{t("listFailed")}</span>
          )}
        </div>
      )}
    </li>
  );

  let body;
  if (failed) body = <div className={styles.note}>{t("failed")}</div>;
  else if (!runs) body = <div className={styles.note}>{t("loading")}</div>;
  else if (!runs.length) {
    body = (
      <>
        <div className={styles.note}>{t("empty")}</div>
        {yourRow && <ol className={styles.list}>{yourRow}</ol>}
      </>
    );
  }
  else {
    body = (
      <ol className={styles.list}>
        {runs.flatMap((run, i) => {
          const card = run.derived?.signatureCardId
            ? SkillCards.getById(run.derived.signatureCardId)
            : null;
          const pIdol = run.derived?.pIdolId
            ? PIdols.getById(run.derived.pIdolId)
            : null;
          const plan = pIdol?.plan || card?.plan;
          const idol = getIdolName(run.derived?.idolId);
          const median = run.stats?.median;
          const row = (
            <li key={run.id}>
              <Link href={`/s/${run.id}`} className={styles.row}>
                <span className={styles.rank}>{i + 1}</span>
                {card ? (
                  <Image
                    src={gkImg(card).icon}
                    width={32}
                    height={32}
                    alt={card.name}
                    draggable={false}
                  />
                ) : (
                  <span className={styles.placeholder} />
                )}
                <span className={styles.text}>
                  <span className={styles.name}>
                    {run.name || t("untitled")}
                  </span>
                  <span className={styles.meta}>
                    {[
                      idol,
                      plan && plan != "free" && tDex(`plans.${plan}`),
                      openedByText(tRun, run),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={styles.score}>
                  {median == null ? "—" : Math.round(median).toLocaleString()}
                </span>
              </Link>
            </li>
          );
          return i === place?.index ? [yourRow, row] : [row];
        })}
        {place?.index === runs.length && yourRow}
      </ol>
    );
  }

  return (
    <section className={styles.stageSharedRuns}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{t("title")}</span>
        <FaChevronDown className={c(styles.chevron, open && styles.open)} />
      </button>
      {open && (
        <div className={styles.body}>
          {body}
          {runs?.length > 0 && (
            <Link
              href={{
                pathname: "/shared",
                query: { stage: String(stageId), sort: "top" },
              }}
              className={styles.seeAll}
            >
              {t("seeAll")}
            </Link>
          )}
          {yourListing?.step == "done" ? (
            <div className={styles.hint}>{t("listedNote")}</div>
          ) : (
            <div className={styles.hint}>{t("howToList")}</div>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(StageSharedRuns);
