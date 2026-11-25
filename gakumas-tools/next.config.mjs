import path from "path";
import { createRequire } from "module";
import createNextIntlPlugin from "next-intl/plugin";

const require = createRequire(import.meta.url);
const withNextIntl = createNextIntlPlugin();

const LEGACY_REDIRECTS = [
  ["/produce-rank-calculator", "/calculator/hif"],
  ["/lesson-calculator", "/calculator/hajime/lesson"],
  ["/calculator", "/calculator/hif"],
  ["/calculator/hajime", "/calculator/hajime/produce-rank"],
];

const LOCALE_PREFIXES = ["", "/en", "/zh-Hans", "/ko", "/es"];

const gkImgBaseUrl = process.env.NEXT_PUBLIC_GK_IMG_BASE_URL;
const gkImgHostname = gkImgBaseUrl && new URL(gkImgBaseUrl).hostname;
const gkImgOrigin = gkImgBaseUrl && new URL(gkImgBaseUrl).origin;
const isDev = process.env.NODE_ENV !== "production";

const GOOGLE_ANALYTICS = [
  "https://*.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];
// tesseract.js fetches its worker, core and language data from jsDelivr.
const JSDELIVR = "https://cdn.jsdelivr.net";

const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    isDev && "'unsafe-eval'",
    "https://*.googletagmanager.com",
    JSDELIVR,
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://cdn.discordapp.com",
    "https://authjs.dev",
    gkImgOrigin,
    ...GOOGLE_ANALYTICS,
  ],
  "font-src": ["'self'"],
  "connect-src": [
    "'self'",
    isDev && "ws:",
    JSDELIVR,
    ...GOOGLE_ANALYTICS,
  ],
  "media-src": ["'self'", "blob:"],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["https://www.youtube.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  // next-auth's built-in sign-in page posts a form that redirects to Discord.
  "form-action": ["'self'", "https://discord.com"],
  "frame-ancestors": ["'none'"],
};

const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([name, sources]) => [name, ...sources.filter(Boolean)].join(" "))
  .join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com", port: "" },
      ...(gkImgHostname
        ? [{ protocol: "https", hostname: gkImgHostname, port: "" }]
        : []),
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return LEGACY_REDIRECTS.flatMap(([from, to]) =>
      LOCALE_PREFIXES.map((prefix) => ({
        source: `${prefix}${from}`,
        destination: `${prefix}${to}`,
        permanent: true,
      }))
    );
  },
  // When NEXT_PUBLIC_GK_IMG_BASE_URL is set, resolve gakumas-images to its
  // remote entry — CDN URLs only, no image files bundled. When unset (fork
  // default), resolve to the bundled entry and register a file-emitting
  // loader so webpack turns each imported image into a /_next/static/media/
  // asset.
  webpack: (config, { dev, isServer }) => {
    const entry = gkImgBaseUrl ? "remote.js" : "bundled.js";
    config.resolve.alias = {
      ...config.resolve.alias,
      "gakumas-images$": require.resolve(`gakumas-images/${entry}`),
    };

    config.module.rules.push({
      test: /\.csv$/,
      type: "json",
      loader: path.resolve("loaders/csvLoader.js"),
    });

    if (!gkImgBaseUrl) {
      config.module.rules = config.module.rules.filter(
        (c) => c.loader != "next-image-loader"
      );
      config.module.rules.push({
        test: /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i,
        loader: path.resolve("loaders/imageLoader.js"),
        issuer: { not: /\.(css|scss|sass)$/ },
        dependency: { not: ["url"] },
        resourceQuery: {
          not: [
            new RegExp("__next_metadata__"),
            new RegExp("__next_metadata_route__"),
            new RegExp("__next_metadata_image_meta__"),
          ],
        },
        options: { isDev: dev, isServer },
      });
    }
    return config;
  },
  output: "standalone",
  // Fonts read at runtime by the opengraph-image routes (utils/og.js).
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/*"],
  },
};

export default withNextIntl(nextConfig);
