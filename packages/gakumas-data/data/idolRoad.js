import IDOL_ROAD_PATTERNS from "../csv/idol_road_patterns.csv";
import IDOL_ROAD_STAGES from "../csv/idol_road_stages.csv";
import IDOL_ROAD_EFFECTS from "../csv/idol_road_effects.csv";
import { deserializeEffectSequence } from "../utils/effects";
import PIdols from "./pIdols";

// Idol Road (アイドルへの道) stages change with the P-idol who enters them.
// Each idol's road follows one stage list (pattern A or B). A pattern's
// STAGE n is its own stages.csv row: pattern B's STAGE 6 has other turns
// and other 応援/トラブル than pattern A's. The later stages every road
// shares are one row, listed in each pattern.
// - idol_road_patterns.csv: per pattern, its idols and its stage ids in
//   order. An idol in no pattern isn't known yet.
// - idol_road_stages.csv: per stage and idol, the criteria, turn counts
//   and first-turn weights.
// - idol_road_effects.csv: per stage and recommended effect, the 応援/
//   トラブル.
// The stage's plan is the P-idol's. A stage or idol with no row keeps the
// values on its stages.csv row.

function parseTriple(value, parse) {
  const [vocal, dance, visual] = String(value)
    .split(",")
    .map((p) => parse(p));
  return { vocal, dance, visual };
}

function parseIds(value) {
  return String(value ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseInt(p, 10));
}

export function createIdolRoad(stageRows, effectRows, patternRows = []) {
  const patternByIdol = Object.create(null);
  const stageIdsByPattern = Object.create(null);
  for (const row of patternRows) {
    stageIdsByPattern[row.pattern] = parseIds(row.stageIds);
    for (const idolId of parseIds(row.idolIds)) {
      patternByIdol[idolId] = row.pattern;
    }
  }

  const byIdol = Object.create(null);
  for (const row of stageRows) {
    byIdol[`${row.stageId}:${row.idolId}`] = {
      criteria: parseTriple(row.criteria, parseFloat),
      turnCounts: parseTriple(row.turnCounts, (p) => parseInt(p, 10)),
      firstTurns: parseTriple(row.firstTurns, parseFloat),
    };
  }

  const byEffect = Object.create(null);
  for (const row of effectRows) {
    byEffect[`${row.stageId}:${row.recommendedEffect}`] = { src: row.effects };
  }

  function getSupportEffects(stageId, recommendedEffect) {
    const entry = byEffect[`${stageId}:${recommendedEffect}`];
    if (!entry) return [];
    entry.parsed ??= deserializeEffectSequence(entry.src);
    return entry.parsed;
  }

  function getPattern(pIdolId) {
    const pIdol = PIdols.getById(pIdolId);
    return (pIdol && patternByIdol[pIdol.idolId]) || null;
  }

  return {
    // The pattern ("A", "B") of the P-idol's road, or null if not known.
    getPattern,

    // The stage ids of the P-idol's road, in order, or null when its
    // pattern isn't known (then every Idol Road stage may be its).
    getStageIds(pIdolId) {
      const pattern = getPattern(pIdolId);
      return pattern ? stageIdsByPattern[pattern] || [] : null;
    },

    // Returns the stage as the given P-idol plays it. Stages that aren't
    // Idol Road, and unknown P-idols, come back unchanged.
    resolveStage(stage, pIdolId) {
      if (stage?.type !== "idolRoad") return stage;
      const pIdol = PIdols.getById(pIdolId);
      if (!pIdol) return stage;

      const resolved = { ...stage, pIdolId: pIdol.id };
      const idolRow = byIdol[`${stage.id}:${pIdol.idolId}`];
      if (idolRow) Object.assign(resolved, idolRow);
      if (pIdol.plan) resolved.plan = pIdol.plan;

      const supportEffects = getSupportEffects(
        stage.id,
        pIdol.recommendedEffect,
      );
      if (supportEffects.length) {
        resolved.effects = [...(stage.effects || []), ...supportEffects];
      }
      return resolved;
    },
  };
}

const IdolRoad = createIdolRoad(
  IDOL_ROAD_STAGES,
  IDOL_ROAD_EFFECTS,
  IDOL_ROAD_PATTERNS,
);

export default IdolRoad;
