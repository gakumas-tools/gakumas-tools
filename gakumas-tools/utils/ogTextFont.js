// Free text in a preview image (run names, who shared them) can be in any
// script, and the bundled CJK fonts are subsets of the site's own titles. So
// the glyphs a card needs come from Google Fonts' per-text subsets: a few KB
// each, cached here. A failed fetch leaves those glyphs out, never the image.
// Fonts go by role, one name each (satori takes one font per name and
// weight): the locale's Noto Sans first, then a second Han family for the
// characters the first lacks (Simplified ones on a Japanese page), then
// Korean's for Hangul.
const MAIN = "Text Main";
const HAN = "Text Han";
const HANGUL = "Text Hangul";
export const TEXT_FONT_FAMILY = [MAIN, HAN, HANGUL].join(", ");

const FAMILY_BY_LOCALE = {
  ko: "Noto Sans KR",
  "zh-Hans": "Noto Sans SC",
};
const DEFAULT_FAMILY = "Noto Sans JP";
const HAN_FALLBACK = {
  "Noto Sans JP": "Noto Sans SC",
  "Noto Sans KR": "Noto Sans SC",
  "Noto Sans SC": "Noto Sans JP",
};

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
 * named for their roles in TEXT_FONT_FAMILY: the locale's Noto Sans, a second
 * Han family when the text has Han, and Korean's when it has Hangul. Empty
 * when there's nothing to fetch or the fetches fail.
 */
export async function loadTextFonts(text, locale) {
  const chars = [...new Set(text)].filter((ch) => ch.codePointAt(0) > 0x24f);
  if (!chars.length) return [];
  const wanted = chars.sort().join("");
  const main = FAMILY_BY_LOCALE[locale] ?? DEFAULT_FAMILY;
  const roles = [[MAIN, main]];
  if (/\p{Script=Han}/u.test(wanted)) roles.push([HAN, HAN_FALLBACK[main]]);
  if (/\p{Script=Hangul}/u.test(wanted) && main !== "Noto Sans KR") {
    roles.push([HANGUL, "Noto Sans KR"]);
  }
  const fonts = await Promise.all(
    roles.map(async ([name, family]) => ({
      name,
      weight: 700,
      data: await subset(family, wanted),
    })),
  );
  return fonts.filter((font) => font.data);
}
