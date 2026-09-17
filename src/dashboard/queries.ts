import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function getCrawlHistory(client: SupabaseClient, siteId: string, limit = 20) {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select("id, started_at, finished_at, status, total_pages, critical_count, high_count, medium_count, low_count")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
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
    .limit(filter.limit ?? 100);

  if (filter.eventType) query = query.eq("event_type", filter.eventType);
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

export async function getIssuesForCrawlRun(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client
    .from("seo_issue_snapshots")
    .select("*")
    .eq("crawl_run_id", crawlRunId)
    .order("severity");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPagesForCrawlRun(client: SupabaseClient, crawlRunId: string) {
  const { data, error } = await client.from("seo_page_snapshots").select("*").eq("crawl_run_id", crawlRunId);
  if (error) throw new Error(error.message);
  return data ?? [];
}
