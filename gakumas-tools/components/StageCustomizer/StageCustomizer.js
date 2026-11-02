import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  serializeEffectSequence,
  deserializeEffectSequence,
} from "gakumas-data";
import Button from "@/components/Button";
import EffectEditor from "@/components/EffectEditor";
import ParametersInput from "@/components/ParametersInput";
import { createCustomStage } from "@/utils/customStages";
import styles from "./StageCustomizer.module.scss";
import ButtonGroup from "../ButtonGroup";

function StageCustomizer({ initialStage, onApply }) {
  const t = useTranslations("StageCustomizer");

  const [type, setType] = useState(initialStage.type);
  const [turnCounts, setTurnCounts] = useState(
    Object.values(initialStage.turnCounts)
  );
  const [firstTurns, setFirstTurns] = useState(
    Object.values(initialStage.firstTurns)
  );
  const [criteria, setCriteria] = useState(
    Object.values(initialStage.criteria)
  );
  const [effects, setEffects] = useState(
    serializeEffectSequence(initialStage.effects).replaceAll(";", ";\n")
  );

  const TYPE_OPTIONS = [
    { value: "contest", label: t("contest") },
    { value: "linkContest", label: t("linkContest") },
    { value: "event", label: t("event") },
  ];

  function apply() {
    onApply(
      createCustomStage(initialStage, {
        type,
        turnCounts,
        firstTurns,
        criteria,
        effects: deserializeEffectSequence(effects.replace(/\s/g, "")),
      })
    );
  }

  return (
    <div className={styles.stageCustomizer}>
      <label>{t("type")}</label>
      <ButtonGroup selected={type} options={TYPE_OPTIONS} onChange={setType} />

      <label>{t("turnCounts")}</label>
      <ParametersInput
        parameters={turnCounts}
        onChange={setTurnCounts}
        max={100}
      />

      <label>{t("firstTurn")}</label>
      <ParametersInput
        parameters={firstTurns}
        onChange={setFirstTurns}
        max={100}
        round={false}
      />

      <label>{t("criteria")}</label>
      <ParametersInput
        parameters={criteria}
        onChange={setCriteria}
        max={100}
        round={false}
      />

      <label>{t("effects")}</label>
      <div className={styles.effects}>
        <EffectEditor value={effects} onChange={setEffects} />
        <a
          href="https://github.com/gakumas-tools/gakumas-tools/blob/master/packages/gakumas-data/Effects.md"
          target="_blank"
        >
          {t("effectFormat")}
        </a>
      </div>

      <Button className={styles.apply} style="primary" onClick={apply}>
        {t("apply")}
      </Button>
    </div>
  );
}

export default memo(StageCustomizer);
