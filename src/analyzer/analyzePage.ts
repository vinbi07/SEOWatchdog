import * as cheerio from "cheerio";
import type { FetchResult } from "../crawler/fetchPage.js";
import type { PageResult } from "../types/seo.js";
import { config } from "../config/config.js";
import { normalizeUrl } from "../utils/urls.js";
import { classifyPage } from "../pageTypes/classifyPage.js";
import { determinePublicationState } from "../indexing/publicationState.js";
import { extractLinks } from "./links.js";
import { extractAlternateLinks } from "./alternateLinks.js";
import { computeAnchorMetrics, extractAnchors } from "./anchors.js";
import { extractVisibleTextBlocks, findDuplicateVisibleContent } from "./duplicateContent.js";
import { countHeadingsByLevel, extractAllHeadings } from "./headings.js";
import { extractCharset, hasHtml5Doctype } from "./htmlHygiene.js";
import {
  extractCanonical,
  extractHasFavicon,
  extractHasViewport,
  extractImageStats,
  extractLang,
  extractMetaDescription,
  extractOpenGraph,
  extractRobotsMeta,
  extractTitle,
  extractTwitter,
  extractWordCount,
} from "./metadata.js";
import { findMixedContentUrls } from "./mixedContent.js";
import { estimatePixelWidth } from "./pixelWidth.js";
import { extractCompressionEncoding, extractServerHeaders } from "./serverHeaders.js";
import { extractStructuredData, extractStructuredDataDetails } from "./structuredData.js";
import { thresholds } from "../rules/thresholds.js";

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
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headings: [],
    wordCount: 0,
    internalLinks: [],
    externalLinks: [],
    brokenInternalLinks: [],
    internalInboundLinkCount: 0,
    internalOutboundLinkCount: 0,
    anchorMetrics: {
      internalLinkCount: 0,
      uniqueInternalLinkCount: 0,
      externalLinkCount: 0,
      uniqueExternalLinkCount: 0,
      emptyInternalAnchorCount: 0,
      genericAnchorCount: 0,
      ambiguousAnchorTextCount: 0,
      emptyAnchorHrefSamples: [],
      genericAnchorTextSamples: [],
      ambiguousAnchorSamples: [],
    },
    duplicateContentSamples: [],
    images: { total: 0, missingAlt: 0 },
    openGraph: { title: null, description: null, image: null },
    twitter: { card: null, title: null, description: null, image: null },
    structuredData: [],
    structuredDataDetails: [],
    lang: null,
    hasViewport: false,
    hasFavicon: false,
    isIndexable: false,
    pageType: classifyPage(fetchResult.finalUrl),
    sources: { sitemap: false, discovered: false },
    publicationState: "unknown",
    // Placeholder; finalized by analyzeIndexingState() once `sources` is
    // settled for the full crawl (see src/indexing/analyzeIndexingState.ts).
    indexingState: "indexable",
    alternateLinks: [],
    htmlSizeBytes: 0,
    charset: null,
    hasHtml5Doctype: false,
    compressionEncoding: null,
    serverHeaders: {
      server: null,
      xPoweredBy: null,
      contentType: null,
      cacheControl: null,
      contentSecurityPolicy: null,
      strictTransportSecurity: null,
    },
    mixedContentCount: 0,
    mixedContentSamples: [],
    titlePixelWidthEstimate: null,
    metaDescriptionPixelWidthEstimate: null,
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
  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0);
  const headings = extractAllHeadings($);
  const headingCounts = countHeadingsByLevel(headings);
  const wordCount = extractWordCount($);
  const { internalLinks, externalLinks } = extractLinks($, fetchResult.finalUrl, config.siteHost);
  const anchors = extractAnchors($, fetchResult.finalUrl, config.siteHost);
  const anchorMetrics = computeAnchorMetrics(anchors);
  const duplicateContentSamples = findDuplicateVisibleContent(extractVisibleTextBlocks($));
  const images = extractImageStats($);
  const openGraph = extractOpenGraph($);
  const twitter = extractTwitter($);
  const structuredData = extractStructuredData($);
  const structuredDataDetails = extractStructuredDataDetails($);
  const publicationState = determinePublicationState(structuredDataDetails);
  const lang = extractLang($);
  const hasViewport = extractHasViewport($);
  const hasFavicon = extractHasFavicon($);
  const alternateLinks = extractAlternateLinks($);

  const charset = extractCharset($);
  const docHasHtml5Doctype = hasHtml5Doctype(fetchResult.html);
  const htmlSizeBytes = Buffer.byteLength(fetchResult.html, "utf-8");
  const compressionEncoding = extractCompressionEncoding(fetchResult.headers);
  const serverHeaders = extractServerHeaders(fetchResult.headers);

  const pageIsHttps = fetchResult.finalUrl.toLowerCase().startsWith("https://");
  const mixedContentUrls = findMixedContentUrls($, pageIsHttps);
  const mixedContentSamples = mixedContentUrls.slice(0, thresholds.mixedContent.maxSamplesStored);

  const titlePixelWidthEstimate = title ? estimatePixelWidth(title) : null;
  const metaDescriptionPixelWidthEstimate = metaDescription ? estimatePixelWidth(metaDescription) : null;

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
    h1Count: headingCounts.h1Count,
    h2Count: headingCounts.h2Count,
    h3Count: headingCounts.h3Count,
    h4Count: headingCounts.h4Count,
    h5Count: headingCounts.h5Count,
    h6Count: headingCounts.h6Count,
    headings,
    wordCount,
    internalLinks,
    externalLinks,
    internalOutboundLinkCount: internalLinks.length,
    anchorMetrics,
    duplicateContentSamples,
    images,
    openGraph,
    twitter,
    structuredData,
    structuredDataDetails,
    publicationState,
    lang,
    hasViewport,
    hasFavicon,
    isIndexable,
    alternateLinks,
    htmlSizeBytes,
    charset,
    hasHtml5Doctype: docHasHtml5Doctype,
    compressionEncoding,
    serverHeaders,
    mixedContentCount: mixedContentUrls.length,
    mixedContentSamples,
    titlePixelWidthEstimate,
    metaDescriptionPixelWidthEstimate,
    issues: [],
  };
}
