import { PItems, SkillCards } from "gakumas-data";
import { addScoreByType } from "@/utils/simulator";

// Fold cardUsage (keyed by {id, c}) and scoreStats (keyed by type:id) into
// a single per-turn byCard map.
//
// Rows are keyed by (type, id, c) so a loadout with two of the same card
// — one customized, one not — shows as two rows, and p-items share the
// keyspace without colliding with skill-card ids. `draw` is undefined for
// p-items (no hand concept); UI shows "—" for usePct on those rows.
//
// Score from scoreStats is only tracked by id (the engine's entityStart
// log doesn't carry c), so a skill card's total score is split across its
// c-variants proportionally to their use counts. Same for scoreByType.
// P-items carry their own `uses` straight from the engine attribution.
//
// A card can score in a turn it wasn't used (a delayed effect firing).
// That score is split by the variants' use counts over the whole run,
// `runUses` from runVariantUses, so it lands on the variant that scheduled
// it rather than on a separate uncustomized row.
export function combineTurn(usageTurn, scoreTurn, runUses = {}) {
  const byCard = {};

  const ensure = (type, id, c) => {
    const key = `${type}|${id}|${JSON.stringify(c || null)}`;
    if (!byCard[key]) {
      byCard[key] = {
        type,
        id,
        c: c || null,
        use: 0,
        draw: 0,
        score: 0,
        scoreByType: { vocal: 0, dance: 0, visual: 0 },
      };
    }
    return byCard[key];
  };

  // Collect skill-card hand usage first so we know the total per id for
  // splitting score across c-variants.
  for (const key in usageTurn) {
    const e = usageTurn[key];
    if (e.id === 0) continue; // synthetic SKIP row
    const row = ensure("skillCard", e.id, e.c);
    row.use += e.use;
    row.draw += e.draw;
  }

  const skillCardUseById = {};
  for (const key in byCard) {
    const r = byCard[key];
    if (r.type !== "skillCard") continue;
    skillCardUseById[r.id] = (skillCardUseById[r.id] || 0) + r.use;
  }

  for (const key in scoreTurn?.byEntity || {}) {
    const e = scoreTurn.byEntity[key];

    if (e.type === "pItem") {
      const row = ensure("pItem", e.id, null);
      row.use += e.uses || 0;
      row.score += e.score;
      addScoreByType(row.scoreByType, e.scoreByType);
      continue;
    }

    if (e.type !== "skillCard") continue;
    const totalUse = skillCardUseById[e.id] || 0;
    if (totalUse === 0) {
      // Card produced score but wasn't hand-used this turn (e.g. the score
      // came from its passive/delayed effect firing). Split it by the
      // variants' uses over the run; a card never used at all gets a
      // single (id, null) row so the score still surfaces.
      const variants = runUses[e.id] || [];
      const runTotal = variants.reduce((acc, v) => acc + v.use, 0);
      if (!runTotal) {
        const row = ensure("skillCard", e.id, null);
        row.score += e.score;
        addScoreByType(row.scoreByType, e.scoreByType);
        continue;
      }
      for (const { c, use } of variants) {
        if (!use) continue;
        const row = ensure("skillCard", e.id, c);
        const share = use / runTotal;
        row.score += e.score * share;
        addScoreByType(row.scoreByType, e.scoreByType, share);
      }
      continue;
    }
    for (const k in byCard) {
      const r = byCard[k];
      if (r.type !== "skillCard" || r.id !== e.id) continue;
      const share = r.use / totalUse;
      r.score += e.score * share;
      addScoreByType(r.scoreByType, e.scoreByType, share);
    }
  }
  return byCard;
}

// Each skill card's variants (by c) with their use counts over all turns:
// { [id]: [{ c, use }] }.
export function runVariantUses(usageTurns) {
  const byKey = {};
  for (const usageTurn of usageTurns) {
    for (const key in usageTurn) {
      const e = usageTurn[key];
      if (e.id === 0) continue; // synthetic SKIP row
      const k = `${e.id}|${JSON.stringify(e.c || null)}`;
      byKey[k] ??= { id: e.id, c: e.c || null, use: 0 };
      byKey[k].use += e.use;
    }
  }
  const byId = {};
  for (const { id, c, use } of Object.values(byKey)) {
    (byId[id] ??= []).push({ c, use });
  }
  return byId;
}

// Sum per-turn rows into a single totals row. Keys come from combineTurn
// already (id|c tuple), so variants stay distinct.
export function combineTotal(perTurn) {
  const byCard = {};
  for (const turn of perTurn) {
    for (const key in turn.byCard) {
      const src = turn.byCard[key];
      if (!byCard[key]) {
        byCard[key] = {
          type: src.type,
          id: src.id,
          c: src.c,
          use: 0,
          draw: 0,
          score: 0,
          scoreByType: { vocal: 0, dance: 0, visual: 0 },
        };
      }
      byCard[key].use += src.use;
      byCard[key].draw += src.draw;
      byCard[key].score += src.score;
      addScoreByType(byCard[key].scoreByType, src.scoreByType);
    }
  }
  return byCard;
}

export function sumTurnMeta(perTurn) {
  const turnTypeCounts = { vocal: 0, dance: 0, visual: 0 };
  const totalScoreByType = { vocal: 0, dance: 0, visual: 0 };
  let totalScore = 0;
  for (const t of perTurn) {
    turnTypeCounts.vocal += t.turnTypeCounts.vocal;
    turnTypeCounts.dance += t.turnTypeCounts.dance;
    turnTypeCounts.visual += t.turnTypeCounts.visual;
    totalScoreByType.vocal += t.totalScoreByType.vocal;
    totalScoreByType.dance += t.totalScoreByType.dance;
    totalScoreByType.visual += t.totalScoreByType.visual;
    totalScore += t.totalScore;
  }
  return { turnTypeCounts, totalScoreByType, totalScore };
}

export function formatScore(score) {
  if (!score) return "0";
  if (Math.abs(score) >= 1000) return Math.round(score).toLocaleString();
  if (Math.abs(score) >= 10) return score.toFixed(0);
  return score.toFixed(1);
}

function extractSortValue(row, by) {
  if (by === "card") {
    if (row.type === "pItem") return PItems.getById(row.id)?.name || "";
    return SkillCards.getById(row.id)?.name || "";
  }
  if (by === "use") return row.use;
  if (by === "usePct") return row.draw ? row.use / row.draw : 0;
  if (by === "score") return row.score;
  return 0;
}

export function sortRows(byCard, sort) {
  const rows = Object.values(byCard);
  const dirMul = sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = extractSortValue(a, sort.by);
    const bv = extractSortValue(b, sort.by);
    if (typeof av === "string") return av.localeCompare(bv) * dirMul;
    return (av - bv) * dirMul;
  });
  return rows;
}
