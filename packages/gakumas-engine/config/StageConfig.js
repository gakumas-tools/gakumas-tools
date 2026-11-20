function countTurnTypes(turnTypes) {
  const counts = { vocal: 0, dance: 0, visual: 0 };
  for (const type of turnTypes) {
    if (!(type in counts)) throw new Error(`Unknown turn type: ${type}`);
    counts[type]++;
  }
  return counts;
}

export default class StageConfig {
  constructor(stage) {
    const {
      id,
      type,
      plan,
      season,
      defaultCardSet,
      turnCounts,
      firstTurns,
      criteria,
      effects,
      linkTurnCounts = [],
      turnTypes,
    } = stage;
    this.id = id;
    this.type = type;
    this.plan = plan;
    this.defaultCardSet = defaultCardSet;
    this.season = season;
    // A produce exam's turn order is shown in game before it starts and
    // varies between runs, so it comes in as given rather than drawn.
    this.turnTypes = turnTypes ? [...turnTypes] : null;
    this.turnCounts = this.turnTypes
      ? countTurnTypes(this.turnTypes)
      : turnCounts;
    this.firstTurns = firstTurns;
    this.criteria = criteria;
    this.effects = effects;
    this.turnCount =
      this.turnCounts.vocal + this.turnCounts.dance + this.turnCounts.visual;
    this.linkTurnCounts = linkTurnCounts;
    this.linkPhaseChangeTurns = this.calculateLinkPhaseChangeTurns();
  }

  calculateLinkPhaseChangeTurns() {
    let cumulativeTurns = 0;
    return this.linkTurnCounts.map((turnCount) => {
      cumulativeTurns += turnCount;
      return cumulativeTurns;
    });
  }
}
