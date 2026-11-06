"use client";
import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import ButtonGroup from "@/components/ButtonGroup";
import Input from "@/components/Input";
import Panel from "@/components/Panel";
import ParametersInput from "@/components/ParametersInput";
import ProduceRankResult from "@/components/ProduceRankResult";
import {
  calculateTargetRound2Scores,
  calculateTotalRating,
  getBoostedRound2StarGain,
  getRank,
  MAX_PARAMS,
  MAX_PRE_ROUND2_STAR,
  MAX_ROUND1_SCORE,
  MAX_ROUND2_SCORE,
  MAX_TOTAL_SCORE,
  TARGET_RATING_BY_RANK,
} from "@/utils/hif";
import InfoTag from "./InfoTag";
import TargetScoreTable from "./TargetScoreTable";
import shared from "./ProduceRankCalculator.module.scss";
import styles from "./HifCalculator.module.scss";

const SCORE_MODES = ["total", "split"];

function HifCalculator() {
  const t = useTranslations("Calculator");

  const SCORE_MODE_OPTIONS = SCORE_MODES.map((mode) => ({
    value: mode,
    label: t(`hifScoreModes.${mode}`),
  }));

  const [params, setParams] = useState([null, null, null]);
  const [preRound2Star, setPreRound2Star] = useState(null);
  const [scoreMode, setScoreMode] = useState("total");
  const [leftScore, setLeftScore] = useState(null);
  const [round2Score, setRound2Score] = useState(null);

  const round1Score = useMemo(() => {
    const left = leftScore || 0;
    const r2 = round2Score || 0;
    if (scoreMode === "total") return Math.max(0, left - r2);
    return left;
  }, [scoreMode, leftScore, round2Score]);

  const totalScore = round1Score + (round2Score || 0);

  // The left field holds the total in one mode and round 1 in the other, so
  // convert it on a switch to keep the scores the user entered.
  const changeScoreMode = (mode) => {
    if (mode === scoreMode) return;
    if (leftScore != null) {
      setLeftScore(mode === "total" ? totalScore : round1Score);
    }
    setScoreMode(mode);
  };

  const boostedStarGain = getBoostedRound2StarGain(round2Score || 0);

  const allEmpty =
    !params.some((p) => p) &&
    !preRound2Star &&
    !leftScore &&
    !round2Score;

  const totalRating = allEmpty
    ? 0
    : calculateTotalRating({
        params,
        preRound2Star: preRound2Star || 0,
        round1Score,
        round2Score: round2Score || 0,
      });
  const rank = allEmpty ? "?" : getRank(totalRating) || "?";

  const targets = useMemo(
    () =>
      calculateTargetRound2Scores({
        params,
        preRound2Star: preRound2Star || 0,
        round1Score,
        currentRound2Score: round2Score || 0,
      }),
    [params, preRound2Star, round1Score, round2Score],
  );

  const leftMax =
    scoreMode === "total" ? MAX_TOTAL_SCORE : MAX_ROUND1_SCORE;
  const leftLabel =
    scoreMode === "total" ? t("hifTotalScore") : t("hifRound1Score");
  const derivedLabel =
    scoreMode === "total"
      ? t("hifDerivedRound1", { value: round1Score.toLocaleString() })
      : t("hifDerivedTotal", { value: totalScore.toLocaleString() });

  return (
    <div className={shared.stack}>
      <Panel label={t("preRound2")}>
        <div className={styles.stack}>
          <div className={styles.field}>
            <label>{t("parameters")}</label>
            <ParametersInput
              parameters={params}
              max={MAX_PARAMS}
              onChange={setParams}
            />
          </div>

          <div className={styles.field}>
            <label>{t("star")}</label>
            <Input
              type="number"
              value={preRound2Star ?? ""}
              placeholder="0"
              onChange={setPreRound2Star}
              min={0}
              max={MAX_PRE_ROUND2_STAR}
            />
          </div>
        </div>
      </Panel>

      <Panel label={t("examScore")} info={t("hifScoreBonusNote")}>
        <div className={styles.modeRow}>
          <ButtonGroup
            options={SCORE_MODE_OPTIONS}
            selected={scoreMode}
            onChange={changeScoreMode}
          />
        </div>

        <div className={styles.scoreGrid}>
          <div className={styles.field}>
            <label>{leftLabel}</label>
            <Input
              type="number"
              value={leftScore ?? ""}
              placeholder="0"
              onChange={setLeftScore}
              min={0}
              max={leftMax}
            />
            <InfoTag className={styles.hint} label={derivedLabel} />
          </div>

          <div className={styles.field}>
            <label>{t("hifRound2Score")}</label>
            <Input
              type="number"
              value={round2Score ?? ""}
              placeholder="0"
              onChange={setRound2Score}
              min={0}
              max={MAX_ROUND2_SCORE}
            />
            <InfoTag
              className={styles.hint}
              label={t("hifRound2StarGain", { value: boostedStarGain })}
            />
          </div>
        </div>
      </Panel>

      <Panel label={t("produceRank")}>
        <ProduceRankResult
          rating={totalRating}
          rank={rank}
          ratingByRank={TARGET_RATING_BY_RANK}
        />
      </Panel>

      <Panel label={t("hifTargetRound2Scores")}>
        <TargetScoreTable
          targets={targets}
          ratingByRank={TARGET_RATING_BY_RANK}
        />
      </Panel>
    </div>
  );
}

export default memo(HifCalculator);
