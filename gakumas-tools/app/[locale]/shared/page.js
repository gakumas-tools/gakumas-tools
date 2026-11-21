import { setRequestLocale } from "next-intl/server";
import SharedRunsBrowse from "@/components/SharedRunsBrowse";
import { generateMetadataForTool } from "@/utils/metadata";
import { connect } from "@/utils/mongodb";
import {
  browseSharedRuns,
  parseBefore,
  parseStageId,
  sharedRunStages,
} from "@/utils/sharedRuns";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return await generateMetadataForTool("sharedRuns", locale, "/shared");
}

const iso = (date) => date?.toISOString?.() ?? null;

// Everyone's shared runs, newest first, one stage at a time if asked:
// /shared?stage=<id>&before=<createdAt of the last run on the page before>.
export default async function SharedRunsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const stageId = parseStageId(query.stage);
  const before = parseBefore(query.before);

  const { db } = await connect();
  const [stages, { runs, next }] = await Promise.all([
    sharedRunStages(db),
    browseSharedRuns(db, { stageId, before }),
  ]);

  return (
    <SharedRunsBrowse
      stages={stages}
      stageId={stageId}
      runs={runs.map((run) => ({ ...run, createdAt: iso(run.createdAt) }))}
      next={iso(next)}
      paged={!!before}
    />
  );
}
