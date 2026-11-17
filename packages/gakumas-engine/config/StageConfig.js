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
      linkTurnCounts,
    } = stage;
    this.id = id;
    this.type = type;
    this.plan = plan;
    this.defaultCardSet = defaultCardSet;
    this.season = season;
    this.turnCounts = turnCounts;
    this.firstTurns = firstTurns;
    this.criteria = criteria;
    this.effects = effects;
    this.turnCount = turnCounts.vocal + turnCounts.dance + turnCounts.visual;
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
