import * as cheerio from "cheerio";
import type { FetchResult } from "../crawler/fetchPage.js";
import type { PageResult } from "../types/seo.js";
import { config } from "../config/config.js";
import { normalizeUrl } from "../utils/urls.js";
import { extractLinks } from "./links.js";
import {
  extractCanonical,
  extractHasFavicon,
  extractHasViewport,
  extractHeadings,
  extractImageStats,
  extractLang,
  extractMetaDescription,
  extractOpenGraph,
  extractRobotsMeta,
  extractTitle,
  extractTwitter,
  extractWordCount,
} from "./metadata.js";
import { extractStructuredData } from "./structuredData.js";

/**
 * Turns a raw fetch result into a fully-populated PageResult (minus `issues`,
 * which the rules engine appends later, and `brokenInternalLinks`, which is
 * resolved after the whole site has been crawled).
 */
export function analyzePage(requestedUrl: string, fetchResult: FetchResult): PageResult {
  const base: Omit<PageResult, "issues"> = {
    url: requestedUrl,
    finalUrl: fetchResult.finalUrl,
    status: fetchResult.status,
    redirectCount: fetchResult.redirectCount,
    responseTimeMs: fetchResult.responseTimeMs,
    outcome: fetchResult.outcome,
    errorMessage: fetchResult.errorMessage,
    title: null,
    titleLength: 0,
    metaDescription: null,
    metaDescriptionLength: 0,
    canonical: null,
    robotsMeta: { raw: null, noindex: false, nofollow: false },
    noindex: false,
    h1: [],
    h1Count: 0,
    h2Count: 0,
    wordCount: 0,
    internalLinks: [],
    externalLinks: [],
    brokenInternalLinks: [],
    images: { total: 0, missingAlt: 0 },
    openGraph: { title: null, description: null, image: null },
    twitter: { card: null, title: null, description: null, image: null },
    structuredData: [],
    lang: null,
    hasViewport: false,
    hasFavicon: false,
    isIndexable: false,
  };

  if (fetchResult.outcome !== "ok" || !fetchResult.html) {
    return { ...base, issues: [] };
  }

  // Untrusted input: parsed as markup only, never executed as script.
  const $ = cheerio.load(fetchResult.html);

  const title = extractTitle($);
  const metaDescription = extractMetaDescription($);
  const rawCanonical = extractCanonical($);
  const canonical = rawCanonical ? normalizeUrl(rawCanonical, fetchResult.finalUrl) : null;
  const robotsMeta = extractRobotsMeta($);
  const { h1, h1Count, h2Count } = extractHeadings($);
  const wordCount = extractWordCount($);
  const { internalLinks, externalLinks } = extractLinks($, fetchResult.finalUrl, config.siteHost);
  const images = extractImageStats($);
  const openGraph = extractOpenGraph($);
  const twitter = extractTwitter($);
  const structuredData = extractStructuredData($);
  const lang = extractLang($);
  const hasViewport = extractHasViewport($);
  const hasFavicon = extractHasFavicon($);

  const statusOk = fetchResult.status !== null && fetchResult.status >= 200 && fetchResult.status < 300;
  const isIndexable = statusOk && !robotsMeta.noindex;

  return {
    ...base,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    canonical,
    robotsMeta,
    noindex: robotsMeta.noindex,
    h1,
    h1Count,
    h2Count,
    wordCount,
    internalLinks,
    externalLinks,
    images,
    openGraph,
    twitter,
    structuredData,
    lang,
    hasViewport,
    hasFavicon,
    isIndexable,
    issues: [],
  };
}
