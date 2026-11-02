import { exactFloor } from "@/utils/exactFloor";

export const MAX_PARAMS_BY_DIFFICULTY = {
  regular: 1000,
  pro: 1500,
  master: 1800,
  legend: 3000,
};

export const PARAM_BONUS_BY_PLACE = {
  1: 30,
  2: 20,
  3: 10,
  4: 0,
};

export const PARAM_BONUS_BY_PLACE_LEGEND = {
  1: 160,
  2: 80,
  3: 40,
  4: 0,
};

export const RATING_BY_PLACE = {
  1: 1700,
  2: 900,
  3: 500,
  4: 0,
};

export const TARGET_RATING_BY_RANK = {
  S5: 35000,
  "S4+": 30000,
  S4: 26000,
  "SSS+": 23000,
  SSS: 20000,
  "SS+": 18000,
  SS: 16000,
  "S+": 14500,
  S: 13000,
  "A+": 11500,
  A: 10000,
  "B+": 8000,
  B: 6000,
  "C+": 4500,
  C: 3000,
};

export const REVERSE_RATING_REGIMES = [
  { threshold: 3650, base: 40000, multiplier: 0.01 },
  { threshold: 3450, base: 30000, multiplier: 0.02 },
  { threshold: 3050, base: 20000, multiplier: 0.04 },
  { threshold: 2250, base: 10000, multiplier: 0.08 },
  { threshold: 1500, base: 5000, multiplier: 0.15 },
  { threshold: 0, base: 0, multiplier: 0.3 },
];

export const REVERSE_RATING_REGIMES_LEGEND_MIDTERM = [
  { base: 200000, multiplier: 0 },
  { base: 60000, multiplier: 0.001 },
  { base: 50000, multiplier: 0.002 },
  { base: 40000, multiplier: 0.003 },
  { base: 30000, multiplier: 0.008 },
  { base: 20000, multiplier: 0.05 },
  { base: 10000, multiplier: 0.08 },
  { base: 0, multiplier: 0.11 },
];

export const REVERSE_RATING_REGIMES_LEGEND_FINAL = [
  { threshold: 8700, base: 2000000, multiplier: 0 },
  { threshold: 7300, base: 600000, multiplier: 0.001 },
  { threshold: 6500, base: 500000, multiplier: 0.008 },
  { threshold: 4500, base: 300000, multiplier: 0.01 },
  { threshold: 0, base: 0, multiplier: 0.015 },
];

const PARAM_RATING_MULTIPLIER = 2.3;

const PARAM_RATING_MULTIPLIER_LEGEND = 2.1;

export function calculateRatingExExamScore(
  place,
  params,
  maxParams,
  midtermScore,
  difficulty,
) {
  const PARAM_RATING_MULTIPLIER_USED =
    difficulty === "legend"
      ? PARAM_RATING_MULTIPLIER_LEGEND
      : PARAM_RATING_MULTIPLIER;
  const PARAM_BONUS_BY_PLACE_USED =
    difficulty === "legend"
      ? PARAM_BONUS_BY_PLACE_LEGEND
      : PARAM_BONUS_BY_PLACE;
  const placeParamBonus = PARAM_BONUS_BY_PLACE_USED[place];
  const placeRating = RATING_BY_PLACE[place];
  const paramRating = exactFloor(
    params.reduce(
      (acc, cur) => acc + Math.min(cur + placeParamBonus, maxParams),
      0,
    ) * PARAM_RATING_MULTIPLIER_USED,
  );
  let midtermRating = 0;
  if (difficulty == "legend") {
    for (let { base, multiplier } of REVERSE_RATING_REGIMES_LEGEND_MIDTERM) {
      if (midtermScore > base) {
        midtermRating += (midtermScore - base) * multiplier;
        midtermScore = base;
      }
    }
    midtermRating = Math.floor(midtermRating);
  }
  return placeRating + paramRating + midtermRating;
}

export function calculateTargetScores(ratingExExamScore, difficulty) {
  const REVERSE_RATING_REGIMES_USED =
    difficulty === "legend"
      ? REVERSE_RATING_REGIMES_LEGEND_FINAL
      : REVERSE_RATING_REGIMES;
  return Object.keys(TARGET_RATING_BY_RANK).map((rank) => {
    const targetRating = TARGET_RATING_BY_RANK[rank] - ratingExExamScore;
    for (let { threshold, base, multiplier } of REVERSE_RATING_REGIMES_USED) {
      if (targetRating <= threshold) continue;
      return {
        rank,
        score: Math.ceil(base + (targetRating - threshold) / multiplier),
      };
    }
    return { rank, score: 0 };
  });
}

export function calculateActualRating(
  actualScore,
  ratingExExamScore,
  difficulty,
) {
  const REVERSE_RATING_REGIMES_USED =
    difficulty === "legend"
      ? REVERSE_RATING_REGIMES_LEGEND_FINAL
      : REVERSE_RATING_REGIMES;
  let calcScore = actualScore;
  let actualRating = 0;
  for (let { base, multiplier } of REVERSE_RATING_REGIMES_USED) {
    if (calcScore > base) {
      actualRating += (calcScore - base) * multiplier;
      calcScore = base;
    }
  }
  return Math.floor(actualRating) + ratingExExamScore;
}

export function getRank(rating) {
  for (let rank in TARGET_RATING_BY_RANK) {
    if (rating >= TARGET_RATING_BY_RANK[rank]) return rank;
  }
  return null;
}
