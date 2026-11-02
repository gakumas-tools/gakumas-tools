"use client";
import React, { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import DifficultyPicker from "@/components/DifficultyPicker";
import Input from "@/components/Input";
import Panel from "@/components/Panel";
import ParametersInput from "@/components/ParametersInput";
import c from "@/utils/classNames";
import { exactFloor } from "@/utils/exactFloor";
import { LESSONS_BY_DIFFICULTY } from "@/utils/lessons";
import styles from "./LessonCalculator.module.scss";

const DIFFICULTIES = ["regular", "pro", "master"];
const PARAMS = ["vo", "da", "vi"];
const PARAM_LABELS = ["Vo", "Da", "Vi"];

function LessonCalculator() {
  const t = useTranslations("LessonCalculator");

  const [difficulty, setDifficulty] = useState("master");
  const [paramRates, setParamRates] = useState([null, null, null]);
  const [limitIncrease, setLimitIncrease] = useState(0);

  useEffect(() => {
    setLimitIncrease(0);
  }, [difficulty]);

  const lessons = LESSONS_BY_DIFFICULTY[difficulty];

  return (
    <div className={styles.stack}>
      <Panel label={t("difficulty")}>
        <DifficultyPicker
          difficulties={DIFFICULTIES}
          selected={difficulty}
          onChange={setDifficulty}
        />
      </Panel>

      <Panel className={styles.form}>
        <label>{t("lessonBonus")}</label>
        <ParametersInput
          parameters={paramRates}
          onChange={setParamRates}
          round={false}
        />

        {difficulty == "master" && (
          <>
            <label>{t("limitIncrease")}</label>
            <Input
              type="number"
              value={limitIncrease}
              onChange={setLimitIncrease}
              step={5}
              min={0}
            />
          </>
        )}
      </Panel>

      <Panel label={t("lessons")}>
        <table className={styles.results}>
          <thead>
            <tr>
              <th style={{ width: "11%" }}>{t("week")}</th>
              <th style={{ width: "13%" }}>{t("type")}</th>
              <th style={{ width: "11%" }}>{t("score")}</th>
              {PARAMS.map((param, i) => (
                <th key={param} colSpan={3} className={styles[param]}>
                  {PARAM_LABELS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lessons.map(({ week, lessonTypes }) => (
              <React.Fragment key={week}>
                {lessonTypes.map(({ type, score, main, sub }, i) => (
                  <tr key={type} className={i == 0 ? styles.weekStart : null}>
                    {i == 0 && (
                      <td rowSpan={lessonTypes.length} className={styles.week}>
                        {week}
                      </td>
                    )}
                    <td className={styles.type}>{t(type)}</td>
                    <td className={styles.perfect}>
                      {score + (type == "oikomi" ? 0 : limitIncrease)}
                    </td>
                    {PARAMS.map((lessonParam, i) => (
                      <React.Fragment key={lessonParam}>
                        {type == "oikomi" ? (
                          PARAMS.map((param, j) => (
                            <td
                              key={param}
                              className={c(
                                styles[param],
                                styles.split,
                                param == lessonParam && styles.main
                              )}
                            >
                              {exactFloor(
                                (param == lessonParam ? main : sub) *
                                  (1 + paramRates[j] / 100)
                              )}
                            </td>
                          ))
                        ) : (
                          <td
                            colSpan={3}
                            className={c(styles[lessonParam], styles.main)}
                          >
                            {exactFloor(
                              (score + limitIncrease) *
                                (1 + paramRates[i] / 100)
                            )}
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export default memo(LessonCalculator);
