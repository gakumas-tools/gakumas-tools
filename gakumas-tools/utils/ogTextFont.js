// Free text in a preview image (run names, who shared them) can be in any
// script, and the bundled CJK fonts are subsets of the site's own titles. So
// the glyphs a card needs come from Google Fonts' per-text subsets: a few KB
// each, cached here. A failed fetch leaves those glyphs out, never the image.
export const TEXT_FONT_FAMILY = "Noto Sans Text";

const FAMILY_BY_LOCALE = {
  ko: "Noto Sans KR",
  "zh-Hans": "Noto Sans SC",
};
const DEFAULT_FAMILY = "Noto Sans JP";
const FETCH_TIMEOUT_MS = 3000;
const CACHE_MAX = 200;

const cache = new Map();

async function fetchSubset(family, text) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@700&text=${encodeURIComponent(text)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  ).then((r) => (r.ok ? r.text() : null));
  // With no browser user agent the stylesheet points at a TrueType file,
  // which satori reads (it can't read WOFF2).
  const url = css?.match(
    /src: url\((.+?)\) format\('(?:truetype|opentype)'\)/,
  )?.[1];
  if (!url) return null;
  const font = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return font.ok ? await font.arrayBuffer() : null;
}

function subset(family, text) {
  const key = `${family}\n${text}`;
  if (!cache.has(key)) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    const pending = fetchSubset(family, text).catch(() => null);
    // A failure isn't kept, so the next request tries again.
    pending.then((data) => data || cache.delete(key));
    cache.set(key, pending);
  }
  return cache.get(key);
}

/**
 * Fonts for the characters of `text` beyond Latin, as satori font entries
 * named TEXT_FONT_FAMILY: the locale's Noto Sans, and Korean's too when the
 * text has Hangul. Empty when there's nothing to fetch or the fetch fails.
 */
export async function loadTextFonts(text, locale) {
  const chars = [...new Set(text)].filter((ch) => ch.codePointAt(0) > 0x24f);
  if (!chars.length) return [];
  const wanted = chars.sort().join("");
  const families = [FAMILY_BY_LOCALE[locale] ?? DEFAULT_FAMILY];
  if (/\p{Script=Hangul}/u.test(wanted) && !families.includes("Noto Sans KR")) {
    families.push("Noto Sans KR");
  }
  const fonts = await Promise.all(
    families.map(async (family) => ({
      name: TEXT_FONT_FAMILY,
      weight: 700,
      data: await subset(family, wanted),
    })),
  );
  return fonts.filter((font) => font.data);
}
