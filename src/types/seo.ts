export type Severity = "critical" | "high" | "medium" | "low";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingEntry {
  level: HeadingLevel;
  text: string;
}

export interface AnchorEntry {
  href: string;
  text: string;
  isInternal: boolean;
}

/**
 * Aggregated, page-level anchor diagnostics (not the raw per-anchor list —
 * that's only needed transiently while building this + the related issues).
 */
export interface AmbiguousAnchorSample {
  text: string;
  destinations: string[];
}

export interface AnchorMetrics {
  internalLinkCount: number;
  uniqueInternalLinkCount: number;
  externalLinkCount: number;
  uniqueExternalLinkCount: number;
  emptyInternalAnchorCount: number;
  genericAnchorCount: number;
  /** Same normalized anchor text reused across several different internal destinations on this page. */
  ambiguousAnchorTextCount: number;
  /** Small samples (capped) for issue detail/display — never the full anchor list. */
  emptyAnchorHrefSamples: string[];
  genericAnchorTextSamples: string[];
  ambiguousAnchorSamples: AmbiguousAnchorSample[];
}

export interface DuplicateContentSample {
  /** Truncated for storage/display — never the full block. */
  text: string;
  occurrences: number;
}

export interface AlternateLink {
  hreflang: string;
  href: string;
}

/** Selected response headers only — never a full header dump (see README/dashboard). */
export interface ServerHeaders {
  server: string | null;
  xPoweredBy: string | null;
  contentType: string | null;
  cacheControl: string | null;
  contentSecurityPolicy: string | null;
  strictTransportSecurity: string | null;
}

export interface Issue {
  issueType: string;
  severity: Severity;
  message: string;
  recommendation: string;
  url: string;
  value?: unknown;
}

export interface StructuredDataEntry {
  type: string;
  raw?: unknown;
}

/**
 * Extracted fields for structured-data types we know how to read in detail
 * (currently PodcastEpisode). Kept separate from `structuredData` (the
 * plain list of @type values) so existing consumers of that field are
 * unaffected.
 */
export interface StructuredDataDetail {
  type: string;
  datePublished?: string;
  dateModified?: string;
  episodeNumber?: number | string;
  name?: string;
  url?: string;
}

export interface ImageStats {
  total: number;
  missingAlt: number;
}

export interface OpenGraphMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface TwitterMeta {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface RobotsMeta {
  raw: string | null;
  noindex: boolean;
  nofollow: boolean;
}

export type CrawlOutcome = "ok" | "http_error" | "network_error" | "disallowed_by_robots";

export type PageType = "homepage" | "episode" | "episodes_index" | "booking" | "service" | "generic" | "unknown";

export interface PageSources {
  /** Present in the sitemap that was crawled. */
  sitemap: boolean;
  /** Linked from at least one other crawled page's internal links. */
  discovered: boolean;
}

/**
 * Deterministic best-effort read of whether content is public yet, based
 * only on evidence found in the page (e.g. JSON-LD datePublished) or
 * site-specific configuration. Defaults to "unknown" when there's no
 * reliable signal — never guessed from the URL being linked or from
 * `noindex` itself.
 */
export type PublicationState = "published" | "scheduled" | "draft" | "unknown";

/**
 * A page-level read on whether its noindex status is expected, given its
 * page type and publication state. Kept separate from the plain `noindex`
 * boolean so the rules engine can reason about it without re-deriving
 * context every time.
 */
export type IndexingState = "indexable" | "noindex_expected" | "noindex_review" | "noindex_unexpected";

export interface PageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  redirectCount: number;
  responseTimeMs: number | null;
  outcome: CrawlOutcome;
  errorMessage?: string;

  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;

  robotsMeta: RobotsMeta;
  noindex: boolean;

  h1: string[];
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  /** Full ordered heading list (all levels), used for hierarchy/duplicate checks and the page detail view. */
  headings: HeadingEntry[];
  wordCount: number;

  internalLinks: string[];
  externalLinks: string[];
  brokenInternalLinks: string[];
  internalInboundLinkCount: number;
  internalOutboundLinkCount: number;
  anchorMetrics: AnchorMetrics;

  duplicateContentSamples: DuplicateContentSample[];

  images: ImageStats;

  openGraph: OpenGraphMeta;
  twitter: TwitterMeta;

  structuredData: StructuredDataEntry[];
  structuredDataDetails: StructuredDataDetail[];

  lang: string | null;
  hasViewport: boolean;
  hasFavicon: boolean;

  isIndexable: boolean;

  pageType: PageType;
  sources: PageSources;
  publicationState: PublicationState;
  indexingState: IndexingState;

  alternateLinks: AlternateLink[];

  /** Raw HTML response body size, for historical monitoring (see README Step 2.6). */
  htmlSizeBytes: number;
  charset: string | null;
  hasHtml5Doctype: boolean;
  compressionEncoding: string | null;
  serverHeaders: ServerHeaders;
  mixedContentCount: number;
  mixedContentSamples: string[];

  /** Deterministic character-width approximation — never an exact browser/Google rendering. */
  titlePixelWidthEstimate: number | null;
  metaDescriptionPixelWidthEstimate: number | null;

  issues: Issue[];
}

export interface CrawlSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DiscoverySummary {
  sitemapUrls: number;
  internallyDiscoveredUrls: number;
  /** Successfully crawled pages linked internally but absent from the sitemap, indexable or not. */
  discoveredNotInSitemap: number;
  /** Of those, the subset that are indexable and self-canonical — a real sitemap gap. */
  indexableMissingFromSitemap: number;
  /** Of those, the subset that are noindex/non-indexable — informational only. */
  nonIndexableMissingFromSitemap: number;
  orphanedSitemapPages: number;
}

export interface IndexingSummary {
  indexable: number;
  noindexExpected: number;
  noindexReview: number;
  noindexUnexpected: number;
}

export interface HostCanonicalizationSummary {
  preferredHost: string;
  /** HTTP status of the non-preferred host's homepage request; null when the probe couldn't be made at all. */
  wwwRedirectStatus: number | null;
}

export interface CrawlReport {
  site: string;
  crawlStartedAt: string;
  crawlFinishedAt: string;
  totalPages: number;
  hostCanonicalization: HostCanonicalizationSummary | null;
  discovery: DiscoverySummary;
  indexing: IndexingSummary;
  summary: CrawlSummary;
  siteIssues: Issue[];
  pages: PageResult[];
}

export interface SitemapEntry {
  url: string;
}
