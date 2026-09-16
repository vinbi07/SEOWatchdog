import { config } from "../config/config.js";
import type { PageResult } from "../types/seo.js";

/**
 * Builds a fully-populated, "clean" PageResult for tests, with overrides
 * for the fields a given test cares about. URLs are built from the
 * configured SITE_URL so canonical/domain rules see a matching host.
 */
export function makePage(overrides: Partial<PageResult> = {}): PageResult {
  const url = config.siteOrigin + "/";
  return {
    url,
    finalUrl: url,
    status: 200,
    redirectCount: 0,
    responseTimeMs: 100,
    outcome: "ok",
    title: "A Good Title Between Twenty And Sixty Chars",
    titleLength: 44,
    metaDescription: "A sufficiently descriptive meta description under 160 characters for this page.",
    metaDescriptionLength: 80,
    canonical: url,
    robotsMeta: { raw: null, noindex: false, nofollow: false },
    noindex: false,
    h1: ["Main Heading"],
    h1Count: 1,
    h2Count: 2,
    wordCount: 500,
    internalLinks: [],
    externalLinks: [],
    brokenInternalLinks: [],
    images: { total: 0, missingAlt: 0 },
    openGraph: { title: "OG Title", description: "OG Description", image: "https://example.com/og.png" },
    twitter: { card: "summary", title: "Twitter Title", description: "Twitter Description", image: null },
    structuredData: [],
    lang: "en",
    hasViewport: true,
    hasFavicon: true,
    isIndexable: true,
    issues: [],
    ...overrides,
  };
}
