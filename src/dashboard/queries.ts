import type { SupabaseClient } from "@supabase/supabase-js";
import { compareSeverityThenUrl, summarizeChangesByCrawl } from "./aggregate.js";

export interface SiteSummary {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  lastSuccessfulCrawlAt: string | null;
}

export async function listSites(client: SupabaseClient): Promise<SiteSummary[]> {
  const { data, error } = await client
    .from("seo_sites")
    .select("id, name, domain, base_url, last_successful_crawl_at")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    baseUrl: row.base_url,
    lastSuccessfulCrawlAt: row.last_successful_crawl_at,
  }));
}

export async function getLatestCrawlRun(client: SupabaseClient, siteId: string) {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select("*")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCrawlRunById(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client.from("seo_crawl_runs").select("*").eq("id", crawlRunId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The crawl run immediately before the given one for the same site, used for crawl-detail comparisons. */
export async function getPreviousCrawlRun(client: SupabaseClient, siteId: string, beforeStartedAt: string) {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select("*")
    .eq("site_id", siteId)
    .lt("started_at", beforeStartedAt)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const CRAWL_HISTORY_COLUMNS =
  "id, started_at, finished_at, status, total_pages, critical_count, high_count, medium_count, low_count, indexable_count, noindex_expected_count, noindex_review_count, noindex_unexpected_count";

/**
 * Recent crawl runs plus, in one extra query (not one per row), the
 * new/resolved/changed counts for each — used by both the Crawl History
 * table and the lightweight trend charts.
 */
export async function getCrawlHistoryWithChangeCounts(client: SupabaseClient, siteId: string, limit = 30) {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select(CRAWL_HISTORY_COLUMNS)
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const runs = data ?? [];
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => r.id);
  const { data: changeRows, error: changeError } = await client
    .from("seo_change_events")
    .select("crawl_run_id, event_type, entity_type, url")
    .in("crawl_run_id", runIds);
  if (changeError) throw new Error(changeError.message);

  const changeCounts = summarizeChangesByCrawl(changeRows ?? []);
  return runs.map((run) => ({
    ...run,
    changes: changeCounts[run.id] ?? { newIssues: 0, resolvedIssues: 0, changedPages: 0, total: 0 },
  }));
}

export interface RecentChangesFilter {
  limit?: number;
  eventType?: string;
  severity?: string;
}

export async function getRecentChanges(client: SupabaseClient, siteId: string, filter: RecentChangesFilter = {}) {
  let query = client
    .from("seo_change_events")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);

  if (filter.eventType) {
    query = query.eq("event_type", filter.eventType);
  } else {
    // "Ongoing" events fire every crawl for every still-open issue and
    // aren't a change at all — excluding them by default keeps the feed
    // readable. An explicit eventType filter can still ask for them.
    query = query.neq("event_type", "issue_ongoing");
  }
  if (filter.severity) query = query.eq("severity", filter.severity);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Change events belonging to one crawl run, used to build the "since last crawl" summary for that crawl. */
export async function getChangesForCrawlRun(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client.from("seo_change_events").select("*").eq("crawl_run_id", crawlRunId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Change events touching a single page URL, most recent first — used by the Page Detail view. */
export async function getChangesForUrl(client: SupabaseClient, siteId: string, url: string, limit = 30) {
  const { data, error } = await client
    .from("seo_change_events")
    .select("*")
    .eq("site_id", siteId)
    .eq("url", url)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Recently resolved issues, most recent first — powers the "Recently Resolved" panel. */
export async function getResolvedIssues(client: SupabaseClient, siteId: string, limit = 30) {
  const { data, error } = await client
    .from("seo_change_events")
    .select("*")
    .eq("site_id", siteId)
    .eq("event_type", "issue_resolved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getIssuesForCrawlRun(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client
    .from("seo_issue_snapshots")
    .select("*")
    .eq("crawl_run_id", crawlRunId)
    .order("severity");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Current (latest-crawl) issues for a site, each already carrying
 * first_seen_at / times_seen from the seo_current_issues view — one query,
 * no per-row history lookups.
 */
export async function getCurrentIssues(client: SupabaseClient, siteId: string) {
  const { data, error } = await client.from("seo_current_issues").select("*").eq("site_id", siteId);
  if (error) throw new Error(error.message);
  const issues = data ?? [];
  issues.sort((a, b) => compareSeverityThenUrl(a, b));
  return issues;
}

/** A single current issue by its stable issue_key, with history already attached. */
export async function getCurrentIssueByKey(client: SupabaseClient, siteId: string, issueKey: string) {
  const { data, error } = await client
    .from("seo_current_issues")
    .select("*")
    .eq("site_id", siteId)
    .eq("issue_key", issueKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPagesForCrawlRun(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client.from("seo_page_snapshots").select("*").eq("crawl_run_id", crawlRunId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The latest page snapshots for a site, in one query via the seo_latest_pages view. */
export async function getLatestPages(client: SupabaseClient, siteId: string) {
  const { data, error } = await client.from("seo_latest_pages").select("*").eq("site_id", siteId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A single page's latest snapshot by its exact URL, for the Page Detail view. */
export async function getLatestPageByUrl(client: SupabaseClient, siteId: string, url: string) {
  const { data, error } = await client
    .from("seo_latest_pages")
    .select("*")
    .eq("site_id", siteId)
    .eq("url", url)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
