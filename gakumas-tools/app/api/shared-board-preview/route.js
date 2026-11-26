import { getTranslations } from "next-intl/server";
import { SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import { getStage } from "gakumas-loadout";
import BoardCard from "@/components/OgImage/BoardCard";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/utils/localeUrls";
import { connect } from "@/utils/mongodb";
import {
  loadFonts,
  OG_SIZE,
  PREVIEW_RETRY_CACHE_CONTROL,
  renderImage,
} from "@/utils/og";
import { loadTextFonts } from "@/utils/ogTextFont";
import { createPngCache, fetchAsPng } from "@/utils/pngCache";
import {
  listStageRuns,
  listedRunStages,
  parseStageId,
} from "@/utils/sharedRuns";
import { computeRange, deriveRunMeta } from "@/utils/simulationRun";
import { formatStageNameText } from "@/utils/stages";

const SHOWN = 5;
const ICON_SIZE = 48;

const cachedPng = createPngCache(200);

// A board changes as players list runs, so it's kept an hour, not a day.
const BOARD_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600";

const hasScores = ({ stats }) =>
  ["min", "q1", "median", "q3", "max"].every((k) =>
    Number.isFinite(stats?.[k]),
  );

// A run's signature card icon as the board shows it, as a PNG data URL;
// null when the run has none, or false when it couldn't be fetched.
async function cardIcon(run, origin) {
  const id = deriveRunMeta(run).signatureCardId;
  const card = id ? SkillCards.getById(id) : null;
  const icon = card && gkImg(card).icon;
  if (!icon) return null;
  // A CDN URL, or a bundled image ({ src }) served by this site.
  const src = typeof icon == "string" ? icon : `${origin}${icon.src}`;
  return (
    (await cachedPng(`${src}@${ICON_SIZE}`, () =>
      fetchAsPng(src, ICON_SIZE),
    )) || false
  );
}

// The link card of a stage's board of shared runs (/shared?stage=<id>): its
// top runs by the server's median, as the board ranks them on Top score.
export async function GET(request) {
  const url = new URL(request.url);
  const stageId = parseStageId(url.searchParams.get("stage"));
  const locale = routing.locales.includes(url.searchParams.get("locale"))
    ? url.searchParams.get("locale")
    : routing.defaultLocale;
  // getStage falls back to a default stage for an id it doesn't know.
  const stage = stageId != null ? getStage(stageId) : null;
  if (stage?.id != stageId) return new Response("Not found", { status: 404 });

  const { db } = await connect();
  const [top, listed] = await Promise.all([
    listStageRuns(db, stageId, SHOWN),
    listedRunStages(db),
  ]);
  const shown = top.filter(hasScores);
  if (!shown.length) return new Response("Not found", { status: 404 });
  const total = listed.find((s) => s.stageId == stageId)?.count ?? shown.length;

  const [t, tRun, tStage, tTools] = await Promise.all(
    ["SharedRunsBrowse", "SharedRun", "StageSummary", "tools"].map(
      (namespace) => getTranslations({ locale, namespace }),
    ),
  );
  const icons = await Promise.all(
    shown.map((run) => cardIcon(run, url.origin)),
  );
  const runs = shown.map((run, i) => ({
    name: run.name || tRun("untitled"),
    by: run.sharedBy ? tRun("sharedBy", { name: run.sharedBy }) : null,
    icon: icons[i] || null,
    stats: run.stats,
  }));
  const title = tTools("sharedRuns.title");
  const stageName = formatStageNameText(stage, tStage);
  const more =
    total > runs.length ? t("metaMore", { count: total - runs.length }) : null;

  const text = [title, stageName, more, ...runs.flatMap((r) => [r.name, r.by])]
    .filter(Boolean)
    .join("");
  const [fonts, textFonts] = await Promise.all([
    loadFonts(locale),
    loadTextFonts(text, locale),
  ]);

  // Without its glyphs a name would be blank, so the card falls back to the
  // site's own for a minute and tries again.
  if (/[^\u0000-\u024f]/.test(text) && !textFonts.length) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: `${SITE_URL}/opengraph-image`,
        "Cache-Control": PREVIEW_RETRY_CACHE_CONTROL,
      },
    });
  }

  return renderImage(
    <BoardCard
      title={title}
      stageName={stageName}
      runs={runs}
      axis={computeRange(runs)}
      more={more}
    />,
    {
      ...OG_SIZE,
      fonts: [...fonts, ...textFonts],
      headers: {
        // An icon that didn't load is tried again in a minute.
        "Cache-Control": icons.includes(false)
          ? PREVIEW_RETRY_CACHE_CONTROL
          : BOARD_CACHE_CONTROL,
      },
    },
  );
}
