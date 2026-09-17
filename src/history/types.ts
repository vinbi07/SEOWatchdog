import type { Severity } from "../types/seo.js";

/** Minimal read of a previously persisted page snapshot, used only for comparison. */
export interface PreviousPageRecord {
  normalizedUrl: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1Count: number;
  wordCount: number;
  noindex: boolean;
  isIndexable: boolean;
  indexingState: string;
  publicationState: string;
  pageType: string;
  sourceSitemap: boolean;
  sourceDiscovered: boolean;
  internalInboundLinkCount: number;
  structuredDataTypes: string[];
}

/** Minimal read of a previously persisted issue snapshot, used only for comparison. */
export interface PreviousIssueRecord {
  issueKey: string;
  url: string;
  issueType: string;
  severity: Severity;
}

export type ChangeEntityType = "issue" | "page" | "site";

export type ChangeEventType =
  | "issue_new"
  | "issue_ongoing"
  | "issue_resolved"
  | "severity_changed"
  | "page_new"
  | "page_removed"
  | "field_changed"
  | "indexability_changed"
  | "indexing_state_changed"
  | "publication_state_changed"
  | "page_added_to_sitemap"
  | "page_removed_from_sitemap"
  | "page_became_discovered"
  | "page_no_longer_discovered"
  | "http_status_changed"
  | "canonical_changed";

export interface ChangeEvent {
  eventType: ChangeEventType;
  entityType: ChangeEntityType;
  url: string | null;
  issueKey: string | null;
  severity: Severity | null;
  fieldName: string | null;
  previousValue: unknown;
  currentValue: unknown;
  message: string;
  metadata: Record<string, unknown>;
}

export interface ComparisonSummary {
  baseline: boolean;
  previousCrawlId: string | null;
  newIssues: number;
  resolvedIssues: number;
  ongoingIssues: number;
  newPages: number;
  removedPages: number;
  changedPages: number;
}

export interface CrawlComparisonResult {
  comparison: ComparisonSummary;
  changes: ChangeEvent[];
}
