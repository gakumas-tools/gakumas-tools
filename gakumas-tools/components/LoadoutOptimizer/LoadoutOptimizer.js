import { useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import LoadoutContext from "@/contexts/LoadoutContext";
import { compareLayoutsInWorker } from "@/simulator/loadoutOptimizer";
import { paramLayouts } from "@/utils/loadoutOptimizer";
import styles from "./LoadoutOptimizer.module.scss";

const PARAM_NAMES = ["Vo", "Da", "Vi"];

function formatScore(score) {
  return Math.round(score).toLocaleString();
}

function loadoutKey(loadout, params, enterPercents) {
  return JSON.stringify([{ ...loadout, params }, enterPercents]);
}

export default function LoadoutOptimizer({ enterPercents }) {
  const t = useTranslations("LoadoutOptimizer");
  const { loadout, setParams } = useContext(LoadoutContext);
  const controller = useRef(null);
  const [progress, setProgress] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState(null);

  const currentKey = loadoutKey(loadout, loadout.params, enterPercents);
  useEffect(() => () => controller.current?.abort(), [currentKey]);

  const layouts = paramLayouts(loadout.params);
  const running = progress != null;
  const compared = comparison?.beforeKey == currentKey;
  const applied = comparison?.afterKey == currentKey;

  async function compare() {
    controller.current = new AbortController();
    const { signal } = controller.current;
    const baseline = { id: "current", loadout };
    const candidates = layouts.map((params, i) => ({
      id: `layout-${i + 1}`,
      loadout: { ...loadout, params },
    }));
    setProgress(0);
    setComparison(null);
    setError(null);

    try {
      const result = await compareLayoutsInWorker(
        { baseline, candidates, enterPercents },
        {
          signal,
          onProgress: (completed, total) =>
            setProgress(Math.round((completed / total) * 100)),
        },
      );
      const selected = candidates.find(({ id }) => id == result.selectedId);
      setComparison({
        result,
        before: loadout.params,
        after: selected?.loadout.params,
        beforeKey: currentKey,
        afterKey:
          selected &&
          loadoutKey(loadout, selected.loadout.params, enterPercents),
      });
    } catch {
      setError(signal.aborted ? "cancelled" : "failed");
    } finally {
      setProgress(null);
    }
  }

  const { result, before, after } = comparison || {};
  return (
    <div className={styles.optimizer}>
      <div className={styles.actions}>
        <Button
          style="primary"
          onClick={compare}
          disabled={running || !layouts.length}
        >
          {running ? t("progress", { percent: progress }) : t("compare")}
        </Button>
        {running && (
          <Button onClick={() => controller.current.abort()}>
            {t("cancel")}
          </Button>
        )}
      </div>
      {!layouts.length && <p>{t("noAlternatives")}</p>}
      {error && <Alert>{t(error)}</Alert>}

      {(compared || applied) && (
        <>
          <p>{t(result.accepted ? "improved" : "retained")}</p>
          {result.validation && (
            <p>
              {t("validation", {
                baseline: formatScore(result.validation.baselineMean),
                candidate: formatScore(result.validation.candidateMean),
                low: formatScore(result.validation.lowerGain),
                high: formatScore(result.validation.upperGain),
              })}
            </p>
          )}
          {result.accepted && (
            <dl className={styles.params}>
              {PARAM_NAMES.map((name, i) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {before[i]} → {after[i]}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {result.accepted && compared && (
            <Button style="primary" onClick={() => setParams(after)}>
              {t("apply")}
            </Button>
          )}
          {applied && (
            <Button onClick={() => setParams(before)}>{t("undo")}</Button>
          )}
        </>
      )}
    </div>
  );
}
