import IDOL_ROAD_STAGES from "../csv/idol_road_stages.csv";
import IDOL_ROAD_EFFECTS from "../csv/idol_road_effects.csv";
import { deserializeEffectSequence } from "../utils/effects";
import PIdols from "./pIdols";

// Idol Road (アイドルへの道) stages change with the P-idol who enters them.
// idol_road_stages.csv holds the criteria, turn counts and first-turn
// weights per stage and idol; idol_road_effects.csv holds the 応援効果
// per stage and recommended effect. The stage's plan is the P-idol's.
// A stage or idol with no row keeps the values on its stages.csv row.

function parseTriple(value, parse) {
  const [vocal, dance, visual] = String(value)
    .split(",")
    .map((p) => parse(p));
  return { vocal, dance, visual };
}

export function createIdolRoad(stageRows, effectRows) {
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

  return {
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

const IdolRoad = createIdolRoad(IDOL_ROAD_STAGES, IDOL_ROAD_EFFECTS);

export default IdolRoad;
