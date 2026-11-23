import IDOL_ROAD_STAGES from "../csv/idol_road_stages.csv";
import IDOL_ROAD_EFFECTS from "../csv/idol_road_effects.csv";
import IDOL_ROAD_TEXTS from "../csv/idol_road_texts.csv";
import { deserializeEffectSequence } from "../utils/effects";
import PIdols from "./pIdols";

// Idol Road (アイドルへの道) stages change with the P-idol who enters them.
// idol_road_stages.csv holds the criteria, turn counts and first-turn
// weights per stage and idol; idol_road_effects.csv holds the 応援効果
// per stage and recommended effect. The stage's plan is the P-idol's.
// idol_road_texts.csv holds the 応援/トラブル lines as the game words them,
// per stage, recommended effect and turn. They are shown, never simulated.
// A stage or idol with no row keeps the values on its stages.csv row.

function parseTriple(value, parse) {
  const [vocal, dance, visual] = String(value)
    .split(",")
    .map((p) => parse(p));
  return { vocal, dance, visual };
}

export function createIdolRoad(stageRows, effectRows, textRows = []) {
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

  const textsByStage = Object.create(null);
  for (const row of textRows) {
    const branches = (textsByStage[row.stageId] ??= []);
    let branch = branches.find(
      (b) => b.recommendedEffect === row.recommendedEffect,
    );
    if (!branch) {
      branch = { recommendedEffect: row.recommendedEffect, lines: [] };
      branches.push(branch);
    }
    branch.lines.push({
      turn: parseInt(row.turn, 10),
      kind: row.kind || null,
      text: row.text,
    });
  }
  for (const branches of Object.values(textsByStage)) {
    for (const branch of branches) {
      branch.lines.sort((a, b) => a.turn - b.turn);
    }
  }

  return {
    // The stage's 応援/トラブル lines in in-game wording, one entry per
    // recommended effect, each line with its turn and kind ("support",
    // "trouble", or null when the game's kind wasn't recorded).
    getStageTexts(stageId) {
      return textsByStage[stageId] || [];
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
  IDOL_ROAD_TEXTS,
);

export default IdolRoad;
