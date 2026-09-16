export type Severity = "critical" | "high" | "medium" | "low";

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
  wordCount: number;

  internalLinks: string[];
  externalLinks: string[];
  brokenInternalLinks: string[];
  internalInboundLinkCount: number;
  internalOutboundLinkCount: number;

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

export interface CrawlReport {
  site: string;
  crawlStartedAt: string;
  crawlFinishedAt: string;
  totalPages: number;
  discovery: DiscoverySummary;
  indexing: IndexingSummary;
  summary: CrawlSummary;
  siteIssues: Issue[];
  pages: PageResult[];
}

export interface SitemapEntry {
  url: string;
}
