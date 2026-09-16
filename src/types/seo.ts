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

  images: ImageStats;

  openGraph: OpenGraphMeta;
  twitter: TwitterMeta;

  structuredData: StructuredDataEntry[];

  lang: string | null;
  hasViewport: boolean;
  hasFavicon: boolean;

  isIndexable: boolean;

  issues: Issue[];
}

export interface CrawlSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CrawlReport {
  site: string;
  crawlStartedAt: string;
  crawlFinishedAt: string;
  totalPages: number;
  summary: CrawlSummary;
  pages: PageResult[];
}

export interface SitemapEntry {
  url: string;
}
