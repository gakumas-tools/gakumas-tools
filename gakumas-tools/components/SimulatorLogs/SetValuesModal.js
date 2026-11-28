import { useState } from "react";
import { useTranslations } from "next-intl";
import { S, SET_VALUE_FIELDS, STANCES } from "gakumas-engine";
import Button from "@/components/Button";
import Input from "@/components/Input";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import styles from "./SimulatorLogs.module.scss";

// Sets the score, 体力 and buffs to the ones the game shows, so the next
// choice (and the simulator's pick) starts from where the player really is.
export default function SetValuesModal({
  state,
  plan,
  maxStamina,
  onConfirm,
  onClose,
}) {
  const t = useTranslations("stage");
  const fields = [
    ...SET_VALUE_FIELDS.all,
    ...(SET_VALUE_FIELDS[plan] ||
      Object.entries(SET_VALUE_FIELDS)
        .filter(([key]) => key != "all")
        .flatMap(([, list]) => list)),
  ];
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field, state[S[field]]]))
  );
  const set = (field) => (value) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  return (
    <Modal onClose={onClose}>
      <h3>{t("setValuesPrompt")}</h3>
      <div className={styles.setValues}>
        {fields.map((field) => (
          <label key={field} className={styles.setValue}>
            <span>{t(field)}</span>
            {field == "stance" ? (
              <Select
                value={values.stance}
                options={STANCES.map((stance) => ({
                  value: stance,
                  label: t(stance),
                }))}
                onChange={set(field)}
              />
            ) : (
              <Input
                type="number"
                round
                min={0}
                max={field == "stamina" ? maxStamina : undefined}
                value={values[field]}
                onChange={set(field)}
              />
            )}
          </label>
        ))}
      </div>
      <Button style="blue" fill onClick={() => onConfirm(values)}>
        {t("confirm")}
      </Button>
    </Modal>
  );
}
