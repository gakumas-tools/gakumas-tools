import { Stages } from "gakumas-data";

// The reference pages for game stages: /dex/reference/stages lists them by
// kind, /dex/reference/stages/<id> shows one. Custom stages have no page.

export const STAGE_GROUPS = ["idolRoad", "contest", "linkContest", "event"];

export function stagePath(id) {
  return `/dex/reference/stages/${id}`;
}

// Only a plain id is looked up, so each stage has one URL.
export function getReferenceStage(id) {
  if (!/^[1-9]\d*$/.test(String(id))) return null;
  const stage = Stages.getById(Number(id));
  return stage && STAGE_GROUPS.includes(stage.type) ? stage : null;
}

// Newest season first; within a season or road, stage then round in order.
function compareStages(a, b) {
  const season = (Number(b.season) || 0) - (Number(a.season) || 0);
  if (season) return season;
  const stage = (Number(a.stage) || 0) - (Number(b.stage) || 0);
  if (stage) return stage;
  const round = (Number(a.round) || 0) - (Number(b.round) || 0);
  return round || a.id - b.id;
}

// [{ type, stages }] in STAGE_GROUPS order, leaving out kinds with no stages.
export function groupedStages(stages = Stages.getAll()) {
  return STAGE_GROUPS.map((type) => ({
    type,
    stages: stages.filter((s) => s.type == type).sort(compareStages),
  })).filter((group) => group.stages.length);
}

export function stagePaths() {
  return groupedStages().flatMap((g) => g.stages.map((s) => stagePath(s.id)));
}

// The turns of each kind and their total, in Vo, Da, Vi order.
export function stageTurns(stage) {
  const counts = ["vocal", "dance", "visual"].map(
    (k) => Number(stage.turnCounts?.[k]) || 0,
  );
  return { counts, total: counts.reduce((a, b) => a + b, 0) };
}
