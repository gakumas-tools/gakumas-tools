import { getMessages, getTranslations } from "next-intl/server";
import { Descriptions } from "gakumas-data";
import { SITE_URL, alternateLanguages, localePath } from "@/utils/localeUrls";

const SITE_NAME = "Gakumas Tools";

export async function generateDefaultMetadata(locale) {
  const t = await getTranslations({ locale, namespace: "metadata" });
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    ogDescription: t("description"),
    twitterCard: "summary",
  });
}

export async function generateMetadataForTool(tool, locale, path) {
  const t_meta = await getTranslations({ locale, namespace: "metadata" });
  const t_tools = await getTranslations({ locale, namespace: "tools" });
  // Optional SEO-specific strings; fall back to the UI title/description.
  const messages = await getMessages({ locale });
  const { metaTitle, metaDescription } = messages.tools?.[tool] ?? {};
  return buildMetadata({
    locale,
    path,
    title: `${metaTitle ?? t_tools(`${tool}.title`)} - ${t_meta("title")}`,
    description:
      metaDescription ??
      `${t_tools(`${tool}.description`)} - ${t_meta("description")}`,
    ogDescription: metaDescription ?? t_tools(`${tool}.description`),
    twitterCard: "summary_large_image",
  });
}

export async function generateMetadataForReference(entity, slug, locale) {
  const t_meta = await getTranslations({ locale, namespace: "metadata" });
  const t_dex = await getTranslations({ locale, namespace: "Dex" });
  const t_page = await getTranslations({ locale, namespace: "EntityPage" });
  const category = t_dex(`tabs.${slug}`);
  const description =
    Descriptions.get(entity)?.replaceAll("\n", " ") ||
    t_page("metaDescription", { name: entity.name, category });
  return buildMetadata({
    locale,
    path: `/dex/reference/${slug}/${entity.id}`,
    title: `${entity.name} | ${category} - ${t_meta("title")}`,
    description,
    ogDescription: description,
    twitterCard: "summary_large_image",
  });
}

function buildMetadata({
  locale,
  path,
  title,
  description,
  ogDescription,
  twitterCard,
}) {
  // Only emit canonical/hreflang/og:url when the page's path is known.
  const url =
    path != null ? localePath(locale, path, { absolute: true }) : undefined;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    ...(url && {
      alternates: {
        canonical: url,
        languages: alternateLanguages(path),
      },
    }),
    openGraph: {
      title,
      description: ogDescription,
      ...(url && { url }),
      siteName: SITE_NAME,
      locale,
      type: "website",
    },
    twitter: {
      card: twitterCard,
      title,
      description: ogDescription,
    },
  };
}
