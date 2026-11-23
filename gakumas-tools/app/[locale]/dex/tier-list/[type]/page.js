import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import TierList from "@/components/TierList";
import { routing } from "@/i18n/routing";
import { EntityTypes } from "@/utils/entities";
import { generateMetadataForTool } from "@/utils/metadata";
import { recordShareOpen } from "@/utils/recordShareOpen";

const TYPE_BY_SLUG = {
  "skill-cards": EntityTypes.SKILL_CARD,
  "p-items": EntityTypes.P_ITEM,
  "p-drinks": EntityTypes.P_DRINK,
  "p-idols": EntityTypes.P_IDOL,
};

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    Object.keys(TYPE_BY_SLUG).map((type) => ({ locale, type })),
  );
}

export async function generateMetadata({ params, searchParams }) {
  const { locale, type } = await params;
  const entityType = TYPE_BY_SLUG[type];

  const metadata = await generateMetadataForTool(
    "tierList",
    locale,
    `/dex/tier-list/${type}`,
  );

  if (entityType) {
    const query = new URLSearchParams(await searchParams);
    query.set("type", entityType);
    await recordShareOpen("tierList", query);
    metadata.openGraph.images = [`/api/tier-list-preview?${query.toString()}`];
  }

  return metadata;
}

export default async function TierListPage({ params }) {
  const { locale, type } = await params;
  setRequestLocale(locale);

  const entityType = TYPE_BY_SLUG[type];
  if (!entityType) notFound();

  return <TierList type={entityType} />;
}
