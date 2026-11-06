import { setRequestLocale } from "next-intl/server";
import Simulator from "@/components/Simulator";
import { generateMetadataForTool } from "@/utils/metadata";
import { OG_SIZE } from "@/utils/og";
import { searchParamsFromRecord } from "@/utils/previewLoadout";

export async function generateMetadata({ params, searchParams }) {
  const { locale } = await params;
  const metadata = await generateMetadataForTool("simulator", locale, "/simulator");
  const query = searchParamsFromRecord(await searchParams).toString();
  metadata.openGraph.images = [{ url: `/api/preview?${query}`, ...OG_SIZE }];

  return metadata;
}

export default async function SimulatorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Simulator />;
}
