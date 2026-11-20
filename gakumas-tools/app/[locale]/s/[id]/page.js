import { cache } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import {
  loadoutsToSearchParams,
  loadoutToSearchParams,
} from "gakumas-loadout";
import SharedRun from "@/components/SharedRun";
import { generateMetadataForSharedRun } from "@/utils/metadata";
import { connect } from "@/utils/mongodb";
import { OG_SIZE } from "@/utils/og";
import { recordShareOpen } from "@/utils/recordShareOpen";
import { getSharedRun } from "@/utils/sharedRuns";

// One read per request, shared by the metadata and the page.
const findRun = cache(async (id) => {
  const { db } = await connect();
  return getSharedRun(db, id);
});

function previewQuery(run) {
  const searchParams = run.linkLoadouts?.length
    ? loadoutsToSearchParams(run.linkLoadouts)
    : loadoutToSearchParams(run);
  return searchParams.toString();
}

export async function generateMetadata({ params }) {
  const { locale, id } = await params;
  const run = await findRun(id);
  if (!run) return {};
  const metadata = await generateMetadataForSharedRun(run, locale);
  metadata.openGraph.images = [
    { url: `/api/preview?${previewQuery(run)}`, ...OG_SIZE },
  ];
  return metadata;
}

export default async function SharedRunPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const run = await findRun(id);
  if (!run) notFound();
  await recordShareOpen("sharedRun", new URLSearchParams({ id }));

  return (
    <SharedRun
      run={{ ...run, createdAt: run.createdAt?.toISOString?.() ?? null }}
    />
  );
}
