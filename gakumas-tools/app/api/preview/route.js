import { IdolConfig } from "gakumas-engine";
import gkImg from "gakumas-images";
import Preview from "@/components/Preview";
import { CARD_SIZE, previewLayout } from "@/components/Preview/Preview.styles";
import {
  boundPreviewLoadout,
  collectIcons,
  MAX_GROUPS,
} from "@/components/Preview/previewIcons";
import {
  loadFonts,
  OG_SIZE,
  PREVIEW_CACHE_CONTROL,
  PREVIEW_RETRY_CACHE_CONTROL,
  renderImage,
} from "@/utils/og";
import { createPngCache, fetchAsPng } from "@/utils/pngCache";
import { previewLoadoutFromSearchParams } from "@/utils/previewLoadout";

const cachedPng = createPngCache(500);

export async function GET(request) {
  const url = new URL(request.url);
  const loadout = boundPreviewLoadout(
    previewLoadoutFromSearchParams(url.searchParams),
  );
  const idolConfig = new IdolConfig(loadout);
  const { pItemIds, skillCardIdGroups, customizationGroups } = loadout;

  const isEmpty = skillCardIdGroups.every((g) => g.every((c) => c == 0));

  const layout = previewLayout(
    Math.min(skillCardIdGroups.length, MAX_GROUPS),
    isEmpty,
  );
  const iconSize = Math.ceil(CARD_SIZE * layout.scale);

  const icons = collectIcons(loadout, url.origin, {
    itemIcon: (item) => gkImg(item).icon,
    cardIcon: (card) => gkImg(card, idolConfig.idolId).icon,
  });
  const entries = await Promise.all(
    [...icons].map(async ([key, fetchUrl]) => [
      key,
      await cachedPng(`${fetchUrl}@${iconSize}`, () =>
        fetchAsPng(fetchUrl, iconSize),
      ),
    ])
  );
  const imageMap = Object.fromEntries(entries.filter(([, v]) => v));
  const anyFailed = entries.length > Object.keys(imageMap).length;
  const fonts = await loadFonts();

  return renderImage(
    (
      <Preview
        itemIds={pItemIds}
        skillCardIdGroups={skillCardIdGroups}
        customizationGroups={customizationGroups}
        idolId={idolConfig.idolId}
        isEmpty={isEmpty}
        imageMap={imageMap}
        layout={layout}
      />
    ),
    {
      ...OG_SIZE,
      fonts,
      headers: {
        "Cache-Control": anyFailed
          ? PREVIEW_RETRY_CACHE_CONTROL
          : PREVIEW_CACHE_CONTROL,
      },
    }
  );
}
