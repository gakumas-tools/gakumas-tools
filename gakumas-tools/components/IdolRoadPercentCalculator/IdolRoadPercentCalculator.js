"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { calculateIdolRoadPercents } from "gakumas-engine";
import Button from "@/components/Button";
import ParametersInput from "@/components/ParametersInput";
import styles from "./IdolRoadPercentCalculator.module.scss";

const TYPES = ["vocal", "dance", "visual"];

// Turns the idol's parameters into the stage's score bonus %, from the
// stage's score curve, and applies it to the loadout's % fields.
export default function IdolRoadPercentCalculator({ scoreCurve, onApply }) {
  const t = useTranslations("IdolRoadPercentCalculator");
  const [params, setParams] = useState([null, null, null]);

  const complete = params.every((p) => p != null && p !== "");
  const percents = complete
    ? calculateIdolRoadPercents(
        Object.fromEntries(TYPES.map((key, i) => [key, Number(params[i])])),
        scoreCurve,
      )
    : null;
  const footers = TYPES.map((key) =>
    percents ? `${percents[key]}%` : complete ? t("outOfRange") : "—",
  );

  return (
    <div className={styles.calculator}>
      <label className={styles.label}>{t("label")}</label>
      <ParametersInput
        parameters={params}
        onChange={setParams}
        max={10000}
        attached
        footers={footers}
      />
      <Button
        style="primary"
        disabled={!percents}
        onClick={() => onApply(TYPES.map((key) => percents[key]))}
      >
        {t("apply")}
      </Button>
    </div>
  );
}
