import { toDisplayPath } from "../utils/urls.js";
import type { ChangeEvent, CrawlComparisonResult } from "./types.js";
import type { PersistCrawlResult } from "../persistence/persistCrawl.js";

const MAX_LISTED_PER_SECTION = 5;

const HIGH_PRIORITY_EVENT_TYPES = new Set<ChangeEvent["eventType"]>([
  "indexability_changed",
  "indexing_state_changed",
  "http_status_changed",
  "canonical_changed",
  "page_added_to_sitemap",
  "page_removed_from_sitemap",
  "page_became_discovered",
  "page_no_longer_discovered",
]);

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function priorityRank(change: ChangeEvent): number {
  if (change.severity) return SEVERITY_RANK[change.severity] ?? 4;
  if (HIGH_PRIORITY_EVENT_TYPES.has(change.eventType)) return 1;
  return 3;
}

function displayUrl(url: string | null, siteOrigin: string): string {
  if (!url) return "(site-level)";
  return toDisplayPath(url, siteOrigin);
}

export function printSinceLastCrawl(persistResult: PersistCrawlResult, siteOrigin: string): void {
  console.log("SINCE LAST CRAWL");
  console.log("");

  if (persistResult.status === "skipped") {
    console.log("Persistence disabled. Set PERSIST_RESULTS=true plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    console.log("to enable historical comparison across crawls.");
    console.log("");
    return;
  }

  if (!persistResult.comparisonResult) {
    console.log(`Persistence failed: ${persistResult.errorMessage ?? "unknown error"}.`);
    console.log("Historical comparison is unavailable for this run; local output/latest-crawl.json is still valid.");
    console.log("");
    return;
  }

  const { comparison, changes }: CrawlComparisonResult = persistResult.comparisonResult;

  if (comparison.baseline) {
    console.log("Baseline crawl established.");
    console.log("Future audits will compare against this crawl.");
    console.log("");
    return;
  }

  console.log(`New Issues:       ${comparison.newIssues}`);
  console.log(`Resolved Issues:  ${comparison.resolvedIssues}`);
  console.log(`Ongoing Issues:   ${comparison.ongoingIssues}`);
  console.log(`New Pages:        ${comparison.newPages}`);
  console.log(`Missing Pages:    ${comparison.removedPages}`);
  console.log(`Changed Pages:    ${comparison.changedPages}`);
  console.log("");

  const newIssues = changes
    .filter((c) => c.eventType === "issue_new")
    .sort((a, b) => priorityRank(a) - priorityRank(b));
  const resolvedIssues = changes.filter((c) => c.eventType === "issue_resolved");
  const pageChanges = changes
    .filter((c) => c.entityType === "page" && c.eventType !== "page_new" && c.eventType !== "page_removed")
    .sort((a, b) => priorityRank(a) - priorityRank(b));
  const newPages = changes.filter((c) => c.eventType === "page_new");
  const removedPages = changes.filter((c) => c.eventType === "page_removed");

  if (newIssues.length > 0) {
    console.log("NEW");
    console.log("");
    for (const change of newIssues.slice(0, MAX_LISTED_PER_SECTION)) {
      if (change.severity) console.log(change.severity.toUpperCase());
      console.log(displayUrl(change.url, siteOrigin));
      console.log(change.message);
      console.log("");
    }
    if (newIssues.length > MAX_LISTED_PER_SECTION) {
      console.log(`... and ${newIssues.length - MAX_LISTED_PER_SECTION} more new issue(s)`);
      console.log("");
    }
  }

  if (resolvedIssues.length > 0) {
    console.log("RESOLVED");
    console.log("");
    for (const change of resolvedIssues.slice(0, MAX_LISTED_PER_SECTION)) {
      console.log(displayUrl(change.url, siteOrigin));
      console.log(change.message);
      console.log("");
    }
    if (resolvedIssues.length > MAX_LISTED_PER_SECTION) {
      console.log(`... and ${resolvedIssues.length - MAX_LISTED_PER_SECTION} more resolved issue(s)`);
      console.log("");
    }
  }

  if (pageChanges.length > 0) {
    console.log("CHANGED");
    console.log("");
    for (const change of pageChanges.slice(0, MAX_LISTED_PER_SECTION)) {
      console.log(displayUrl(change.url, siteOrigin));
      console.log("");
      console.log(change.message);
      console.log("");
    }
    if (pageChanges.length > MAX_LISTED_PER_SECTION) {
      console.log(`... and ${pageChanges.length - MAX_LISTED_PER_SECTION} more changed page(s)`);
      console.log("");
    }
  }

  if (newPages.length > 0) {
    console.log("NEW PAGES");
    console.log("");
    for (const change of newPages.slice(0, MAX_LISTED_PER_SECTION)) {
      console.log(displayUrl(change.url, siteOrigin));
    }
    if (newPages.length > MAX_LISTED_PER_SECTION) {
      console.log(`... and ${newPages.length - MAX_LISTED_PER_SECTION} more`);
    }
    console.log("");
  }

  if (removedPages.length > 0) {
    console.log("MISSING PAGES");
    console.log("");
    for (const change of removedPages.slice(0, MAX_LISTED_PER_SECTION)) {
      console.log(displayUrl(change.url, siteOrigin));
    }
    if (removedPages.length > MAX_LISTED_PER_SECTION) {
      console.log(`... and ${removedPages.length - MAX_LISTED_PER_SECTION} more`);
    }
    console.log("");
  }
}
