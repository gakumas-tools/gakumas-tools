import IDOL_ROAD_PATTERNS from "../csv/idol_road_patterns.csv";
import IDOL_ROAD_PATTERN_STAGES from "../csv/idol_road_pattern_stages.csv";
import IDOL_ROAD_STAGES from "../csv/idol_road_stages.csv";
import IDOL_ROAD_EFFECTS from "../csv/idol_road_effects.csv";
import { deserializeEffectSequence } from "../utils/effects";
import PIdols from "./pIdols";
import Stages from "./stages";

// Idol Road (アイドルへの道) stages change with the P-idol who enters them.
// Each idol's road follows one stage list (pattern A or B). A pattern's
// STAGE n is its own stages.csv row: pattern B's STAGE 6 has other turns
// and other 応援/トラブル than pattern A's. The later stages every road
// shares are one row, listed in each pattern.
// - idol_road_patterns.csv: per pattern, its idols. An idol in no
//   pattern isn't known yet.
// - idol_road_pattern_stages.csv: per stage, a pattern it's on; a shared
//   stage has a row for each. A new stage only adds rows.
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

// Where a stage is on its road: its STAGE number.
const stageNumber = (stageId) => Stages.getById(stageId)?.stage;

export function createIdolRoad(
  stageRows,
  effectRows,
  patternRows = [],
  patternStageRows = [],
  stageNumberOf = stageNumber,
) {
  const patternByIdol = Object.create(null);
  for (const row of patternRows) {
    for (const idolId of parseIds(row.idolIds)) {
      patternByIdol[idolId] = row.pattern;
    }
  }
  // Each pattern's stages in STAGE order, whatever order their rows came in.
  const stageIdsByPattern = Object.create(null);
  for (const row of patternStageRows) {
    (stageIdsByPattern[row.pattern] ??= []).push(parseInt(row.stageId, 10));
  }
  const at = (id) => Number(stageNumberOf(id) ?? Infinity);
  for (const ids of Object.values(stageIdsByPattern)) {
    ids.sort((a, b) => at(a) - at(b));
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

    // What the data lacks for the given P-idol on an Idol Road stage:
    // supportEffects when there is no 応援効果 row for the P-idol's
    // おすすめ効果, idolRow when there is no criteria/turns row for the
    // P-idol's idol. resolveStage then runs the stage without them. Null
    // when nothing is missing, for other stage types and for unknown P-idols.
    getMissingData(stage, pIdolId) {
      if (stage?.type !== "idolRoad") return null;
      const pIdol = PIdols.getById(pIdolId);
      if (!pIdol) return null;

      const supportEffects = !(
        `${stage.id}:${pIdol.recommendedEffect}` in byEffect
      );
      const idolRow = !(`${stage.id}:${pIdol.idolId}` in byIdol);
      if (!supportEffects && !idolRow) return null;
      return {
        recommendedEffect: pIdol.recommendedEffect,
        supportEffects,
        idolRow,
      };
    },
  };
}

const IdolRoad = createIdolRoad(
  IDOL_ROAD_STAGES,
  IDOL_ROAD_EFFECTS,
  IDOL_ROAD_PATTERNS,
  IDOL_ROAD_PATTERN_STAGES,
);

export default IdolRoad;
