import { routing } from "@/i18n/routing";
import { alternateLanguages, localePath } from "@/utils/localeUrls";

const PATHS = [
  "/",
  "/calculator/hajime/produce-rank",
  "/calculator/hajime/lesson",
  "/calculator/nia",
  "/calculator/hif",
  "/memory-calculator",
  "/dex",
  "/dex/reference/skill-cards",
  "/dex/reference/p-items",
  "/dex/reference/p-drinks",
  "/dex/tier-list/skill-cards",
  "/dex/tier-list/p-items",
  "/dex/tier-list/p-drinks",
  "/dex/tier-list/p-idols",
  "/dex/collection/p-idols",
  "/memories",
  "/simulator",
  "/rehearsal",
];

export default function sitemap() {
  return PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localePath(locale, path, { absolute: true }),
      priority: path === "/" ? 1.0 : 0.7,
      alternates: { languages: alternateLanguages(path) },
    })),
  );
}
