// For one suite loadout per plan, moved to the plan's latest contest stage,
// compares each other Vo/Da/Vi order of its params with its own.
import { Stages } from "gakumas-data";
import {
  compareLoadoutCandidates,
  createLoadoutEvaluator,
  paramLayouts,
} from "../gakumas-tools/utils/loadoutOptimizer.js";
import { loadSuite, loadoutFromQuery } from "./lib.mjs";

const suite = loadSuite();
for (const plan of ["sense", "logic", "anomaly"]) {
  const row = suite.find(({ query }) => {
    const stage = Stages.getById(loadoutFromQuery(query).stageId);
    return stage.type == "contest" && stage.plan == plan;
  });
  const stage = Stages.findLast(
    (stage) => stage.type == "contest" && stage.plan == plan && !stage.preview,
  );
  const loadout = { ...loadoutFromQuery(row.query), stageId: stage.id };
  const candidates = paramLayouts(loadout.params).map((params, i) => ({
    id: `layout-${i + 1}`,
    loadout: { ...loadout, params },
  }));

  const result = await compareLoadoutCandidates({
    baseline: { id: row.id, loadout },
    candidates,
    evaluate: createLoadoutEvaluator(false),
  });
  console.log(
    JSON.stringify({ plan, fixture: row.id, stage: stage.id, ...result }),
  );
}
