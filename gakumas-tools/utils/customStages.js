function typeValues([vocal, dance, visual]) {
  return { vocal: vocal || 0, dance: dance || 0, visual: visual || 0 };
}

function sum(values) {
  return values.reduce((a, b) => a + (b || 0), 0);
}

export function customStageErrors({
  type,
  turnCounts,
  firstTurns,
  linkTurnCounts,
}) {
  const errors = [];
  const turnCount = sum(turnCounts);
  if (!turnCount) errors.push("invalidTurnCounts");

  const firstTurnTypes = [0, 1, 2].filter((i) => firstTurns[i] > 0);
  if (!firstTurnTypes.length || firstTurnTypes.some((i) => !turnCounts[i])) {
    errors.push("invalidFirstTurns");
  }

  if (
    type == "linkContest" &&
    (linkTurnCounts.some((count) => !count) || sum(linkTurnCounts) != turnCount)
  ) {
    errors.push("invalidLinkTurnCounts");
  }
  return errors;
}

// Season picks the scoring formula, param cap and event starter deck.
export function createCustomStage(
  initialStage,
  { type, turnCounts, firstTurns, criteria, linkTurnCounts, effects },
) {
  const sameType = type == initialStage.type;
  const firstTurnTotal = sum(firstTurns) || 1;
  return {
    id: "custom",
    type,
    plan: sameType ? initialStage.plan : "free",
    season: sameType ? initialStage.season : undefined,
    turnCounts: typeValues(turnCounts),
    firstTurns: typeValues(
      firstTurns.map((rate) => (rate || 0) / firstTurnTotal),
    ),
    criteria: typeValues(criteria),
    effects,
    linkTurnCounts: type == "linkContest" ? linkTurnCounts : [],
  };
}
