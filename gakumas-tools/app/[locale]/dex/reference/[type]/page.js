import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import EntityReference from "@/components/EntityReference";
import { routing } from "@/i18n/routing";
import { generateMetadataForTool } from "@/utils/metadata";
import { REFERENCE_SLUGS, referenceType } from "@/utils/referenceEntities";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    REFERENCE_SLUGS.map((type) => ({ locale, type })),
  );
}

export async function generateMetadata({ params }) {
  const { locale, type } = await params;

  return await generateMetadataForTool(
    "dex",
    locale,
    `/dex/reference/${type}`,
  );
}

export default async function ReferencePage({ params }) {
  const { locale, type } = await params;
  setRequestLocale(locale);

  const entityType = referenceType(type);
  if (!entityType) notFound();

  return <EntityReference type={entityType} />;
}
