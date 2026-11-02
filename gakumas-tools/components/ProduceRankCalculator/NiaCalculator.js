"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FaCircleChevronDown } from "react-icons/fa6";
import { Idols } from "gakumas-data";
import gkImg from "gakumas-images";
import Alert from "@/components/Alert";
import ButtonGroup from "@/components/ButtonGroup";
import DifficultyPicker from "@/components/DifficultyPicker";
import IconSelect from "@/components/IconSelect";
import { LineChart } from "@/components/Charts";
import Input from "@/components/Input";
import Panel from "@/components/Panel";
import ParametersInput from "@/components/ParametersInput";
import ProduceRankResult from "@/components/ProduceRankResult";
import Table from "@/components/Table";
import { usePopOnChange } from "@/utils/usePop";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import c from "@/utils/classNames";
import { exactFloor } from "@/utils/exactFloor";
import { getRank, TARGET_RATING_BY_RANK } from "@/utils/produceRank";
import {
  BALANCE_BY_IDOL,
  calculateBonusParams,
  calculateChallengeParams,
  calculateGainedParams,
  calculateGainedVotes,
  calculatePostAuditionParams,
  calculateRecommendedScores,
  calculateVoteRating,
  getVoteRank,
  MAX_PARAMS_BY_DIFFICULTY,
  MIN_VOTES_BY_STAGE,
  PARAM_ORDER_BY_IDOL,
  PARAM_REGIMES_BY_DIFF_STAGE_BALANCE_ORDER,
  VOTE_REGIMES_BY_DIFF_STAGE,
} from "@/utils/nia";
import InfoTag from "./InfoTag";
import ParamBadges from "./ParamBadges";
import Params from "./Params";
import shared from "./ProduceRankCalculator.module.scss";
import styles from "./NiaCalculator.module.scss";

const AFFECTION_OPTIONS = [...new Array(11)].map((x, i) => ({
  value: i + 10,
  label: i + 10,
}));

const IDOL_OPTIONS = Idols.getAll()
  .filter((idol) => idol.id !== 14)
  .map((idol) => ({
    id: idol.id,
    iconSrc: gkImg(idol).icon,
    alt: idol.name,
  }));

const STAGE_OPTIONS_BY_DIFFICULTY = {
  pro: [
    { value: "melobang", label: "メロBang!" },
    { value: "galaxy", label: "GALAXY" },
    { value: "quartet", label: "QUARTET" },
    { value: "finale", label: "FINALE" },
  ],
  master: [
    { value: "quartet", label: "QUARTET" },
    { value: "finale", label: "FINALE" },
  ],
};

const FINAL_AUDITIONS = ["quartet", "finale"];

export default function NiaCalculator() {
  const t = useTranslations("Calculator");

  const DIFFICULTIES = ["pro", "master"];
  const TABLE_HEADERS = [t("produceRank"), "Vo", "Da", "Vi"];

  const { idolId: workspaceIdolId, setIdolId } = useContext(WorkspaceContext);
  // The workspace idol may be one N.I.A doesn't offer (e.g. 亜紗里).
  const idolId = IDOL_OPTIONS.some((o) => o.id == workspaceIdolId)
    ? workspaceIdolId
    : IDOL_OPTIONS[0].id;

  const [difficulty, setDifficulty] = useState("master");
  const [stage, setStage] = useState("finale");
  const [params, setParams] = useState([null, null, null]);
  const [challengeParamBonus, setChallengeParamBonus] = useState(55);
  const [paramBonuses, setParamBonuses] = useState([null, null, null]);
  const [votes, setVotes] = useState(MIN_VOTES_BY_STAGE[stage]);
  const [affection, setAffection] = useState(20);
  const [scores, setScores] = useState([null, null, null]);

  let paramRegimesByOrder =
    PARAM_REGIMES_BY_DIFF_STAGE_BALANCE_ORDER[difficulty][stage];
  if (difficulty === "master") {
    const balance = BALANCE_BY_IDOL[idolId];
    paramRegimesByOrder = paramRegimesByOrder[balance];
  }
  const voteRegimes = VOTE_REGIMES_BY_DIFF_STAGE[difficulty][stage];

  useEffect(() => {
    if (votes < MIN_VOTES_BY_STAGE[stage]) {
      setVotes(MIN_VOTES_BY_STAGE[stage]);
    }
  }, [stage]);

  const maxParams = MAX_PARAMS_BY_DIFFICULTY[difficulty];
  const paramOrder = PARAM_ORDER_BY_IDOL[idolId];

  const recommendedScores = useMemo(
    () =>
      FINAL_AUDITIONS.includes(stage)
        ? calculateRecommendedScores(
            paramRegimesByOrder,
            voteRegimes,
            maxParams,
            paramOrder,
            challengeParamBonus,
            paramBonuses,
            affection,
            params,
            votes,
          )
        : null,
    [
      stage,
      paramRegimesByOrder,
      voteRegimes,
      maxParams,
      paramOrder,
      challengeParamBonus,
      paramBonuses,
      affection,
      params,
      votes,
    ],
  );

  const gainedParams = calculateGainedParams(
    paramRegimesByOrder,
    paramOrder,
    scores,
  );
  const bonusParams = calculateBonusParams(gainedParams, paramBonuses);
  const challengeParams = calculateChallengeParams(
    gainedParams,
    bonusParams,
    challengeParamBonus,
  );
  const postAuditionParams = calculatePostAuditionParams(
    maxParams,
    params,
    gainedParams,
    challengeParams,
    bonusParams,
  );
  const totalScore = scores.reduce((acc, cur) => acc + cur, 0);
  const gainedVotes = calculateGainedVotes(voteRegimes, affection, totalScore);
  const totalVotes = votes + gainedVotes;
  const voteRank = getVoteRank(totalVotes);

  const paramRating = exactFloor(
    postAuditionParams.reduce((acc, cur) => acc + cur, 0) * 2.3,
  );

  let actualRating = "?";
  let actualRank = "?";
  if (voteRank) {
    const voteRating = calculateVoteRating(totalVotes, voteRank);
    actualRating = paramRating + voteRating;
    actualRank = getRank(actualRating);
  }

  return (
    <div className={shared.stack}>
      <Panel
        label={t("difficulty")}
        headerAction={
          <InfoTag
            className={shared.headerTag}
            label={t("parameterLimit")}
            value={maxParams}
          />
        }
      >
        <DifficultyPicker
          difficulties={DIFFICULTIES}
          selected={difficulty}
          onChange={(diff) => {
            if (diff === "master") {
              setStage("finale");
              setAffection(20);
            } else {
              setChallengeParamBonus(null);
            }
            setDifficulty(diff);
          }}
        />
      </Panel>

      <Panel label={t("idol")}>
        <div className={styles.section}>
          <div className={styles.idolSelect}>
            <IconSelect
              options={IDOL_OPTIONS}
              selected={idolId}
              onChange={setIdolId}
            />
          </div>

          {difficulty === "pro" && (
            <>
              <label>{t("affectionAtStartOfProduce")}</label>
              <ButtonGroup
                options={AFFECTION_OPTIONS}
                selected={affection}
                onChange={setAffection}
              />
            </>
          )}

          <label>{t("paramBonusPct")}</label>
          <ParametersInput
            parameters={paramBonuses}
            max={maxParams}
            onChange={setParamBonuses}
            round={false}
          />

          {difficulty === "master" && (
            <>
              <label>{t("challengePItemsParamBonusPct")}</label>
              <Input
                type="number"
                value={challengeParamBonus || ""}
                placeholder="%"
                onChange={setChallengeParamBonus}
                min={0}
                max={55}
              />
            </>
          )}
        </div>
      </Panel>

      <Panel label={t("stage")}>
        <div className={styles.section}>
          <ButtonGroup
            options={STAGE_OPTIONS_BY_DIFFICULTY[difficulty]}
            selected={stage}
            onChange={setStage}
          />

          <label>{t("paramsPreAudition")}</label>
          <ParametersInput
            parameters={params}
            max={maxParams}
            onChange={setParams}
          />

          <label>{t("votesPreAudition")}</label>
          <Input
            type="number"
            value={votes || ""}
            placeholder={t("voteCount")}
            onChange={setVotes}
            min={0}
            max={10000000}
          />
        </div>
      </Panel>

      {recommendedScores && (
        <Panel label={t("recommendedScores")}>
          <Table
            className={styles.recommendedScores}
            headers={TABLE_HEADERS}
            rows={Object.keys(TARGET_RATING_BY_RANK)
              .slice(0, 8)
              .map((rank) => {
                const recommended = recommendedScores[rank];
                const rankLabel = (
                  <>
                    <span className={shared.rankName}>{rank}</span>
                    <span className={shared.rankRating}>
                      {TARGET_RATING_BY_RANK[rank].toLocaleString()}
                    </span>
                  </>
                );
                if (!recommended) {
                  return [
                    <span key="rank" className={styles.rankLabel}>
                      {rankLabel}
                    </span>,
                    "-",
                    "-",
                    "-",
                  ];
                }
                return [
                  <button
                    key="rank"
                    className={styles.applyButton}
                    onClick={() => setScores(recommended)}
                  >
                    <span className={styles.rankLabel}>{rankLabel}</span>
                    <FaCircleChevronDown />
                  </button>,
                  ...recommended.map((score) => score.toLocaleString()),
                ];
              })}
          />
        </Panel>
      )}

      <Panel label={t("scores")}>
        <div className={styles.section}>
          {difficulty === "pro" && (
            <LineChart
              paramOrder={paramOrder}
              paramRegimes={paramRegimesByOrder}
              scores={scores}
              gainedParams={gainedParams}
            />
          )}

          <ParametersInput
            parameters={scores}
            max={1000000000}
            onChange={setScores}
          />

          <label>{t("gainedParams")}</label>
          <ParamBadges params={gainedParams} />

          <label>{t("bonusParams")}</label>
          <ParamBadges params={bonusParams} />

          {difficulty === "master" && (
            <>
              <label>{t("challengeParams")}</label>
              <ParamBadges params={challengeParams} />
            </>
          )}

          <label>{t("paramsPostAudition")}</label>
          <Params params={postAuditionParams} />
        </div>
      </Panel>

      <Panel label={t("produceRank")}>
        <div className={styles.section}>
          <ProduceRankResult
            rating={actualRating}
            rank={actualRank}
            ratingByRank={TARGET_RATING_BY_RANK}
          />

          <div className={styles.voteStats}>
            <VoteStat
              label={t("gainedVotes")}
              value={`+${gainedVotes.toLocaleString()}`}
            />
            <VoteStat
              label={t("votesPostAudition")}
              value={totalVotes.toLocaleString()}
              tag={voteRank}
            />
          </div>
        </div>
      </Panel>

      <Alert>{t("niaNote")}</Alert>
    </div>
  );
}

function VoteStat({ label, value, tag }) {
  const beat = usePopOnChange(value);

  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span
        className={c(styles.statValue, beat && shared[`beat${beat}`])}
      >
        {value}
        {tag && <span className={styles.statTag}>{tag}</span>}
      </span>
    </div>
  );
}
