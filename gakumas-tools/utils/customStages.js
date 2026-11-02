function typeValues([vocal, dance, visual]) {
  return { vocal: vocal || 0, dance: dance || 0, visual: visual || 0 };
}

// Season picks the scoring formula, param cap and event starter deck.
export function createCustomStage(
  initialStage,
  { type, turnCounts, firstTurns, criteria, effects },
) {
  const sameType = type == initialStage.type;
  const firstTurnTotal = firstTurns.reduce((a, b) => a + (b || 0), 0) || 1;
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
    linkTurnCounts:
      sameType && type == "linkContest" ? initialStage.linkTurnCounts : [],
  };
}
