"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaChevronDown } from "react-icons/fa6";
import Button from "@/components/Button";
import Collapse from "@/components/Collapse";
import Input from "@/components/Input";
import Panel from "@/components/Panel";
import Select from "@/components/Select";
import c from "@/utils/classNames";
import {
  attemptsForChance,
  chanceWithinAttempts,
  MAX_ATTEMPTS,
} from "@/utils/repeatedAttempts";
import styles from "./MemoryCalculator.module.scss";

const CHANCE_OPTIONS = [
  { value: 0.5, label: "50%" },
  { value: 0.9, label: "90%" },
  { value: 0.95, label: "95%" },
  { value: 0.99, label: "99%" },
];

export default function MemoryAttemptPlanner({ probability, stale }) {
  const t = useTranslations("MemoryAttemptPlanner");
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState(10);
  const [targetChance, setTargetChance] = useState(0.9);

  // Summed outcome probabilities can round past 1.
  const successChance = Math.min(probability, 1);
  const chance = attempts && chanceWithinAttempts(successChance, attempts);
  const attemptsNeeded = attemptsForChance(successChance, targetChance);

  return (
    <Panel
      className={styles.attemptPlanner}
      label={t("title")}
      headerAction={
        <Button
          style={open ? "secondary" : "default"}
          size="sm"
          pill
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("hide") : t("show")}
          <FaChevronDown className={c(styles.caret, open && styles.open)} />
        </Button>
      }
    >
      <Collapse
        open={open}
        className={c(styles.planner, stale && styles.stale)}
      >
        <p className={styles.plannerHelp}>{t("assumption")}</p>
        <label className={styles.plannerRow}>
          {t("attempts")}
          <Input
            type="number"
            round
            min={1}
            max={MAX_ATTEMPTS}
            value={attempts}
            onChange={setAttempts}
          />
        </label>
        <p className={styles.plannerResult}>
          {t("atLeastOne")}{" "}
          <strong>{attempts ? `${(chance * 100).toFixed(2)}%` : "—"}</strong>
        </p>
        <label className={styles.plannerRow}>
          {t("targetChance")}
          <Select
            value={targetChance}
            options={CHANCE_OPTIONS}
            onChange={setTargetChance}
          />
        </label>
        <p className={styles.plannerResult}>
          <strong>
            {attemptsNeeded
              ? t("attemptsNeeded", { count: attemptsNeeded })
              : t("beyondLimit", { limit: MAX_ATTEMPTS })}
          </strong>
        </p>
      </Collapse>
    </Panel>
  );
}
