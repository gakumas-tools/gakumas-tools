export const MAX_ATTEMPTS = 1_000_000;

// log1p and expm1 keep tiny probabilities from rounding away next to 1.
export function chanceWithinAttempts(probability, attempts) {
  return -Math.expm1(attempts * Math.log1p(-probability));
}

export function attemptsForChance(probability, chance) {
  const attempts = Math.ceil(Math.log1p(-chance) / Math.log1p(-probability));
  if (attempts > MAX_ATTEMPTS) return null;
  return Math.max(attempts, 1);
}
