import { setRequestLocale } from "next-intl/server";
import SharedRunsBrowse from "@/components/SharedRunsBrowse";
import { getStage } from "gakumas-loadout";
import {
  generateMetadataForSharedStage,
  generateMetadataForTool,
} from "@/utils/metadata";
import { connect } from "@/utils/mongodb";
import { withOpeners } from "@/utils/shareOpens";
import {
  STAGE_RUNS_MAX,
  browseListedRuns,
  listStageRuns,
  listedRunStages,
  parseCursor,
  parseStageId,
} from "@/utils/sharedRuns";

export async function generateMetadata({ params, searchParams }) {
  const { locale } = await params;
  const stageId = parseStageId((await searchParams).stage);
  // getStage falls back to a default stage for an id it doesn't know.
  const stage = stageId != null ? getStage(stageId) : null;
  if (stage?.id == stageId) {
    const { db } = await connect();
    const listed = await listedRunStages(db);
    const count = listed.find((s) => s.stageId == stageId)?.count ?? 0;
    if (count) {
      return await generateMetadataForSharedStage(stage, count, locale);
    }
  }
  return await generateMetadataForTool("sharedRuns", locale, "/shared");
}

const iso = (date) => date?.toISOString?.() ?? null;

// The runs players listed on their stages, newest first:
// /shared?stage=<id>&after=<cursor>. With a stage, sort=top ranks its runs
// by the server-simulated mean instead, as the simulator's panel does.
export default async function SharedRunsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const stageId = parseStageId(query.stage);
  const top = stageId != null && query.sort == "top";
  const after = top ? null : parseCursor(query.after);

  const { db } = await connect();
  const [stages, { runs: found, next }] = await Promise.all([
    listedRunStages(db),
    top
      ? listStageRuns(db, stageId, STAGE_RUNS_MAX).then((runs) => ({
          runs,
          next: null,
        }))
      : browseListedRuns(db, { stageId, after }),
  ]);
  const runs = await withOpeners(db, found);

  return (
    <SharedRunsBrowse
      stages={stages}
      stageId={stageId}
      sort={top ? "top" : "new"}
      runs={runs.map((run) => ({ ...run, createdAt: iso(run.createdAt) }))}
      next={next}
      paged={!!after}
    />
  );
}
