/**
 * Pure, dependency-free aggregation/decision logic for the dashboard API.
 * Kept separate from server.ts and queries.ts so it can be unit tested
 * without a Supabase connection or an HTTP server.
 */

export type ChangeEventRow = {
  event_type: string;
  entity_type: string;
  url: string | null;
  severity: string | null;
};

export interface SinceLastCrawlSummary {
  newIssues: number;
  resolvedIssues: number;
  ongoingIssues: number;
  newPages: number;
  removedPages: number;
  changedPages: number;
}

export function summarizeSinceLastCrawl(changes: ChangeEventRow[]): SinceLastCrawlSummary {
  const count = (predicate: (c: ChangeEventRow) => boolean) => changes.filter(predicate).length;
  const changedPageUrls = new Set(
    changes
      .filter((c) => c.entity_type === "page" && c.event_type !== "page_new" && c.event_type !== "page_removed")
      .map((c) => c.url)
  );
  return {
    newIssues: count((c) => c.event_type === "issue_new"),
    resolvedIssues: count((c) => c.event_type === "issue_resolved"),
    ongoingIssues: count((c) => c.event_type === "issue_ongoing"),
    newPages: count((c) => c.event_type === "page_new"),
    removedPages: count((c) => c.event_type === "page_removed"),
    changedPages: changedPageUrls.size,
  };
}

export const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function compareSeverityThenUrl(a: { severity: string; url: string }, b: { severity: string; url: string }): number {
  return (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) || a.url.localeCompare(b.url);
}

export type OverallStatus = "healthy" | "needs_attention" | "critical";

export interface StatusInput {
  criticalCount: number;
  highCount: number;
  noindexUnexpectedCount: number;
  majorHttpFailureCount: number;
  newIssuesSinceLastCrawl: number;
}

/**
 * Deterministic health state for the site, not a numeric score. Critical
 * beats Needs Attention beats Healthy; each rule is a simple threshold on
 * numbers already computed elsewhere (severity counts, indexing counts,
 * since-last-crawl deltas) — nothing here is a weighted/derived score.
 */
export function computeOverallStatus(input: StatusInput): OverallStatus {
  if (input.criticalCount > 0 || input.noindexUnexpectedCount > 0 || input.majorHttpFailureCount > 0) {
    return "critical";
  }
  if (input.highCount > 0 || input.newIssuesSinceLastCrawl > 0) {
    return "needs_attention";
  }
  return "healthy";
}

export interface CrawlFreshness {
  minutesAgo: number;
  isStale: boolean;
}

export function computeCrawlFreshness(lastCrawlIso: string | null, now: Date, staleHours: number): CrawlFreshness | null {
  if (!lastCrawlIso) return null;
  const last = new Date(lastCrawlIso).getTime();
  const minutesAgo = Math.max(0, Math.round((now.getTime() - last) / 60000));
  return { minutesAgo, isStale: minutesAgo > staleHours * 60 };
}

export type ChangeCountsByCrawl = Record<string, { newIssues: number; resolvedIssues: number; changedPages: number; total: number }>;

/**
 * Aggregates change events (already fetched in one `.in(crawl_run_id, ids)`
 * query) into per-crawl counts, used for the Crawl History "Changes" column
 * and the New/Resolved trend — avoids a separate query per crawl row.
 */
export function summarizeChangesByCrawl(
  changes: Array<{ crawl_run_id: string; event_type: string; entity_type: string; url: string | null }>
): ChangeCountsByCrawl {
  const byRun = new Map<string, typeof changes>();
  for (const c of changes) {
    const list = byRun.get(c.crawl_run_id) ?? [];
    list.push(c);
    byRun.set(c.crawl_run_id, list);
  }

  const result: ChangeCountsByCrawl = {};
  for (const [runId, rows] of byRun) {
    const newIssues = rows.filter((r) => r.event_type === "issue_new").length;
    const resolvedIssues = rows.filter((r) => r.event_type === "issue_resolved").length;
    const changedPageUrls = new Set(
      rows.filter((r) => r.entity_type === "page" && r.event_type !== "page_new" && r.event_type !== "page_removed").map((r) => r.url)
    );
    result[runId] = {
      newIssues,
      resolvedIssues,
      changedPages: changedPageUrls.size,
      total: newIssues + resolvedIssues + changedPageUrls.size,
    };
  }
  return result;
}
