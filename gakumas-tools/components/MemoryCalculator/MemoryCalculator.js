"use client";
import {
  memo,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import ConfirmModal from "@/components/ConfirmModal";
import IconSelect from "@/components/IconSelect";
import Panel from "@/components/Panel";
import { usePopOnChange } from "@/utils/usePop";
import TabGroup from "@/components/TabGroup";
import MemoryCalculatorContext from "@/contexts/MemoryCalculatorContext";
import ModalContext from "@/contexts/ModalContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import c from "@/utils/classNames";
import { COST_RANGES, COST_RANGES_BY_RANK } from "@/utils/contestPower";
import {
  classifyMemories,
  generatePossibleMemories,
} from "@/utils/skillCardLottery";
import AcquiredSkillCards from "./AcquiredSkillCards";
import DraftPick from "./DraftPick";
import MemoryAttemptPlanner from "./MemoryAttemptPlanner";
import MemoryCalculatorResultList from "./MemoryCalculatorResultList";
import TargetSkillCards from "./TargetSkillCards";
import styles from "./MemoryCalculator.module.scss";

const RANK_OPTIONS = COST_RANGES.toReversed().map(({ rank }) => ({
  id: rank,
  iconSrc: `/ranks/${rank}.png`,
  alt: rank,
}));

function MemoryCalculator() {
  const t = useTranslations("MemoryCalculator");

  const {
    targetSkillCardIds,
    alternateSkillCardIds,
    targetNegations,
    acquiredSkillCardIds,
    rank,
    setRank,
    clearTargetCardIds,
    clearAcquiredCardIds,
  } = useContext(MemoryCalculatorContext);
  const { idolId } = useContext(WorkspaceContext);
  const { setModal } = useContext(ModalContext);
  const [resultsTab, setResultsTab] = useState("success");
  const [switched, setSwitched] = useState(false);

  const confirmClear = (onConfirm) =>
    setModal(
      <ConfirmModal
        message={t("confirm")}
        confirmLabel={t("clear")}
        danger
        onConfirm={onConfirm}
      />
    );

  const costRange = COST_RANGES_BY_RANK[rank];

  const inputs = useMemo(
    () => ({
      targetSkillCardIds,
      alternateSkillCardIds,
      targetNegations,
      acquiredSkillCardIds,
      rank,
    }),
    [
      targetSkillCardIds,
      alternateSkillCardIds,
      targetNegations,
      acquiredSkillCardIds,
      rank,
    ],
  );
  const deferredInputs = useDeferredValue(inputs);
  const stale = deferredInputs !== inputs;

  const possibleMemories = useMemo(
    () =>
      generatePossibleMemories(
        deferredInputs.acquiredSkillCardIds,
        deferredInputs.rank,
      ),
    [deferredInputs.acquiredSkillCardIds, deferredInputs.rank],
  );
  const {
    onTargetMemories,
    offTargetMemories,
    onTargetProbability,
    offTargetProbability,
  } = useMemo(
    () =>
      classifyMemories(possibleMemories, {
        targetSkillCardIds: deferredInputs.targetSkillCardIds,
        alternateSkillCardIds: deferredInputs.alternateSkillCardIds,
        targetNegations: deferredInputs.targetNegations,
      }),
    [
      possibleMemories,
      deferredInputs.targetSkillCardIds,
      deferredInputs.alternateSkillCardIds,
      deferredInputs.targetNegations,
    ],
  );

  return (
    <div className={styles.memoryCalculator}>
      <Alert>{t("note")}</Alert>

      <Panel
        label={t("target")}
        headerAction={
          <Button
            style="red-secondary"
            size="sm"
            pill
            onClick={() => confirmClear(clearTargetCardIds)}
          >
            {t("clear")}
          </Button>
        }
      >
        <TargetSkillCards idolId={idolId} />
      </Panel>

      <Panel
        label={t("acquired")}
        info={t("acquiredInfo")}
        headerAction={
          <Button
            style="red-secondary"
            size="sm"
            pill
            onClick={() => confirmClear(clearAcquiredCardIds)}
          >
            {t("clear")}
          </Button>
        }
      >
        <AcquiredSkillCards />
      </Panel>

      <DraftPick idolId={idolId} />

      <Panel label={t("produceRank")}>
        <div className={styles.settingsRow}>
          <IconSelect
            options={RANK_OPTIONS}
            selected={rank}
            onChange={setRank}
          />
          <div className={styles.settingField}>
            <span className={styles.statLabel}>{t("costRange")}</span>
            <div className={styles.costRange}>
              {costRange.min} ~ {costRange.max}
            </div>
          </div>
        </div>
      </Panel>

      <Panel noPadding className={styles.resultsPanel}>
        <TabGroup
          selected={resultsTab}
          onChange={(tab) => {
            setResultsTab(tab);
            setSwitched(true);
          }}
          options={[
            {
              value: "success",
              label: (
                <OutcomeLabel
                  label={t("success")}
                  probability={onTargetProbability}
                  tone="success"
                />
              ),
            },
            {
              value: "failure",
              label: (
                <OutcomeLabel
                  label={t("failure")}
                  probability={offTargetProbability}
                  tone="failure"
                />
              ),
            },
          ]}
        />
        <div
          key={resultsTab}
          className={c(
            styles.resultsContent,
            stale && styles.stale,
            switched && styles.switched,
          )}
        >
          <MemoryCalculatorResultList
            memories={
              resultsTab === "success" ? onTargetMemories : offTargetMemories
            }
            idolId={idolId}
          />
        </div>
      </Panel>

      <MemoryAttemptPlanner probability={onTargetProbability} stale={stale} />
    </div>
  );
}

function OutcomeLabel({ label, probability, tone }) {
  const beat = usePopOnChange(probability);

  return (
    <span className={styles.outcome}>
      {label}
      <span
        className={c(
          styles.outcomePct,
          styles[tone],
          beat && styles[`beat${beat}`],
        )}
      >
        {(probability * 100).toFixed(2)}%
      </span>
    </span>
  );
}

export default memo(MemoryCalculator);
