import { SITE_URL } from "@/utils/localeUrls";

// Share images are served from /api; crawlers that honor robots.txt for card
// images (e.g. Twitterbot) must be allowed to fetch them. The longer allow
// rules win over the /api/ disallow.
const OG_IMAGE_PATHS = ["/api/preview", "/api/tier-list-preview"];

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: ["/", ...OG_IMAGE_PATHS], disallow: "/api/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
