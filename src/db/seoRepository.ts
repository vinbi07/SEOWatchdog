import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIssueKey } from "../history/issueKey.js";
import { normalizeUrlForComparison } from "../history/normalizeForComparison.js";
import type { ChangeEvent, PreviousIssueRecord, PreviousPageRecord } from "../history/types.js";
import type { ScoreResult } from "../scoring/index.js";
import type { CrawlReport, PageResult } from "../types/seo.js";

export type CrawlRunStatus = "running" | "success" | "partial" | "failed";

export type TriggerType = "manual_cli" | "manual_dashboard" | "system";

export const CRAWL_STAGES = [
  "initializing",
  "discovering",
  "crawling",
  "analyzing",
  "persisting",
  "comparing",
  "scoring",
  "complete",
  "failed",
] as const;

export type CrawlStage = (typeof CRAWL_STAGES)[number];

export interface SiteRow {
  id: string;
  domain: string;
  baseUrl: string;
}

function siteName(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

function siteDomain(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return baseUrl.toLowerCase();
  }
}

export async function findOrCreateSite(client: SupabaseClient, baseUrl: string): Promise<SiteRow> {
  const domain = siteDomain(baseUrl);

  const { data: existing, error: selectError } = await client
    .from("seo_sites")
    .select("id, domain, base_url")
    .eq("domain", domain)
    .maybeSingle();

  if (selectError) throw new Error(`Failed to look up seo_sites: ${selectError.message}`);
  if (existing) {
    return { id: existing.id, domain: existing.domain, baseUrl: existing.base_url };
  }

  const { data: inserted, error: insertError } = await client
    .from("seo_sites")
    .insert({ name: siteName(baseUrl), domain, base_url: baseUrl })
    .select("id, domain, base_url")
    .single();

  if (insertError) throw new Error(`Failed to create seo_sites row: ${insertError.message}`);
  return { id: inserted.id, domain: inserted.domain, baseUrl: inserted.base_url };
}

export async function createRunningCrawlRun(
  client: SupabaseClient,
  siteId: string,
  startedAt: string,
  triggerType: TriggerType | null = null
): Promise<string> {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .insert({
      site_id: siteId,
      started_at: startedAt,
      status: "running" satisfies CrawlRunStatus,
      trigger_type: triggerType,
      current_stage: "initializing" satisfies CrawlStage,
      last_progress_at: startedAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create seo_crawl_runs row: ${error.message}`);
  return data.id;
}

export interface CrawlRunProgressInput {
  stage: CrawlStage;
  pagesDiscovered?: number;
  pagesCrawled?: number;
}

/**
 * Best-effort heartbeat write for live scan state. Callers must swallow
 * errors from this function (never let a failed heartbeat write fail the
 * crawl itself) -- see the reportStage helper in src/index.ts.
 */
export async function updateCrawlRunProgress(
  client: SupabaseClient,
  crawlRunId: string,
  input: CrawlRunProgressInput
): Promise<void> {
  const { error } = await client
    .from("seo_crawl_runs")
    .update({
      current_stage: input.stage,
      ...(input.pagesDiscovered !== undefined ? { pages_discovered: input.pagesDiscovered } : {}),
      ...(input.pagesCrawled !== undefined ? { pages_crawled: input.pagesCrawled } : {}),
      last_progress_at: new Date().toISOString(),
    })
    .eq("id", crawlRunId);

  if (error) throw new Error(`Failed to update seo_crawl_runs progress: ${error.message}`);
}

export interface FinishCrawlRunInput {
  status: CrawlRunStatus;
  finishedAt: string;
  report: CrawlReport;
  errorMessage?: string;
}

export async function finishCrawlRun(client: SupabaseClient, crawlRunId: string, input: FinishCrawlRunInput): Promise<void> {
  const { report } = input;
  const { error } = await client
    .from("seo_crawl_runs")
    .update({
      status: input.status,
      finished_at: input.finishedAt,
      current_stage: input.status === "success" ? ("complete" satisfies CrawlStage) : ("failed" satisfies CrawlStage),
      total_pages: report.totalPages,
      critical_count: report.summary.critical,
      high_count: report.summary.high,
      medium_count: report.summary.medium,
      low_count: report.summary.low,
      sitemap_urls: report.discovery.sitemapUrls,
      internally_discovered_urls: report.discovery.internallyDiscoveredUrls,
      discovered_not_in_sitemap: report.discovery.discoveredNotInSitemap,
      indexable_missing_from_sitemap: report.discovery.indexableMissingFromSitemap,
      non_indexable_missing_from_sitemap: report.discovery.nonIndexableMissingFromSitemap,
      orphaned_sitemap_pages: report.discovery.orphanedSitemapPages,
      indexable_count: report.indexing.indexable,
      noindex_expected_count: report.indexing.noindexExpected,
      noindex_review_count: report.indexing.noindexReview,
      noindex_unexpected_count: report.indexing.noindexUnexpected,
      preferred_host: report.hostCanonicalization?.preferredHost ?? null,
      www_redirect_status: report.hostCanonicalization?.wwwRedirectStatus ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", crawlRunId);

  if (error) throw new Error(`Failed to finish seo_crawl_runs row: ${error.message}`);
}

export async function markCrawlRunErrored(
  client: SupabaseClient,
  crawlRunId: string,
  status: Extract<CrawlRunStatus, "partial" | "failed">,
  errorMessage: string
): Promise<void> {
  const { error } = await client
    .from("seo_crawl_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
      current_stage: "failed" satisfies CrawlStage,
    })
    .eq("id", crawlRunId);
  if (error) throw new Error(`Failed to mark seo_crawl_runs row as ${status}: ${error.message}`);
}

export async function updateSiteLastSuccessfulCrawl(client: SupabaseClient, siteId: string, timestamp: string): Promise<void> {
  const { error } = await client
    .from("seo_sites")
    .update({ last_successful_crawl_at: timestamp, updated_at: new Date().toISOString() })
    .eq("id", siteId);
  if (error) throw new Error(`Failed to update seo_sites.last_successful_crawl_at: ${error.message}`);
}

function pageSnapshotRow(siteId: string, crawlRunId: string, page: PageResult) {
  return {
    crawl_run_id: crawlRunId,
    site_id: siteId,
    url: page.url,
    normalized_url: normalizeUrlForComparison(page.url),
    final_url: page.finalUrl,
    status_code: page.status,
    redirect_count: page.redirectCount,
    response_time_ms: page.responseTimeMs,
    page_type: page.pageType,
    publication_state: page.publicationState,
    indexing_state: page.indexingState,
    is_indexable: page.isIndexable,
    title: page.title,
    title_length: page.titleLength,
    meta_description: page.metaDescription,
    meta_description_length: page.metaDescriptionLength,
    canonical: page.canonical,
    h1_count: page.h1Count,
    h2_count: page.h2Count,
    word_count: page.wordCount,
    internal_inbound_link_count: page.internalInboundLinkCount,
    internal_outbound_link_count: page.internalOutboundLinkCount,
    image_count: page.images.total,
    images_missing_alt: page.images.missingAlt,
    noindex: page.noindex,
    nofollow: page.robotsMeta.nofollow,
    lang: page.lang,
    has_viewport: page.hasViewport,
    has_favicon: page.hasFavicon,
    source_sitemap: page.sources.sitemap,
    source_discovered: page.sources.discovered,
    structured_data: page.structuredData,
    structured_data_details: page.structuredDataDetails,
    open_graph: page.openGraph,
    twitter: page.twitter,
    robots_meta: page.robotsMeta,

    // Step 2.6: audit depth expansion (all additive columns; see
    // supabase/migrations/0003_seo_watchdog_audit_depth.sql).
    html_size_bytes: page.htmlSizeBytes,
    charset: page.charset,
    has_html5_doctype: page.hasHtml5Doctype,
    compression_encoding: page.compressionEncoding,
    internal_link_count: page.anchorMetrics.internalLinkCount,
    unique_internal_link_count: page.anchorMetrics.uniqueInternalLinkCount,
    external_link_count: page.anchorMetrics.externalLinkCount,
    unique_external_link_count: page.anchorMetrics.uniqueExternalLinkCount,
    title_pixel_width_estimate: page.titlePixelWidthEstimate,
    meta_description_pixel_width_estimate: page.metaDescriptionPixelWidthEstimate,
    mixed_content_count: page.mixedContentCount,
    alternate_links: page.alternateLinks,
    headings: page.headings,
    anchor_metrics: page.anchorMetrics,
    server_headers: page.serverHeaders,
    duplicate_content_samples: page.duplicateContentSamples,
  };
}

/** Inserts one immutable snapshot row per crawled page. Returns id + url so issue snapshots can link back. */
export async function insertPageSnapshots(
  client: SupabaseClient,
  siteId: string,
  crawlRunId: string,
  pages: PageResult[]
): Promise<Map<string, string>> {
  const pageSnapshotIdByUrl = new Map<string, string>();
  if (pages.length === 0) return pageSnapshotIdByUrl;

  const rows = pages.map((page) => pageSnapshotRow(siteId, crawlRunId, page));
  const { data, error } = await client.from("seo_page_snapshots").insert(rows).select("id, url");

  if (error) throw new Error(`Failed to insert seo_page_snapshots rows: ${error.message}`);
  for (const row of data ?? []) {
    pageSnapshotIdByUrl.set(row.url, row.id);
  }
  return pageSnapshotIdByUrl;
}

export async function insertIssueSnapshots(
  client: SupabaseClient,
  siteId: string,
  crawlRunId: string,
  pages: PageResult[],
  pageSnapshotIdByUrl: Map<string, string>
): Promise<void> {
  const rows = pages.flatMap((page) =>
    page.issues.map((issue) => ({
      crawl_run_id: crawlRunId,
      site_id: siteId,
      page_snapshot_id: pageSnapshotIdByUrl.get(page.url) ?? null,
      url: page.url,
      issue_key: buildIssueKey(page.url, issue.issueType),
      issue_type: issue.issueType,
      severity: issue.severity,
      message: issue.message,
      recommendation: issue.recommendation,
      value: issue.value ?? null,
    }))
  );

  if (rows.length === 0) return;

  const { error } = await client.from("seo_issue_snapshots").insert(rows);
  if (error) throw new Error(`Failed to insert seo_issue_snapshots rows: ${error.message}`);
}

export interface PreviousCrawlRun {
  id: string;
  startedAt: string;
}

/** Only ever returns a crawl_run with status = 'success', per the "no partial baselines" rule. */
export async function getPreviousSuccessfulCrawlRun(
  client: SupabaseClient,
  siteId: string,
  excludeCrawlRunId: string
): Promise<PreviousCrawlRun | null> {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select("id, started_at")
    .eq("site_id", siteId)
    .eq("status", "success")
    .neq("id", excludeCrawlRunId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to query previous seo_crawl_runs: ${error.message}`);
  if (!data) return null;
  return { id: data.id, startedAt: data.started_at };
}

export async function getPreviousPageSnapshots(client: SupabaseClient, crawlRunId: string): Promise<PreviousPageRecord[]> {
  const { data, error } = await client
    .from("seo_page_snapshots")
    .select(
      "url, normalized_url, final_url, status_code, title, meta_description, canonical, h1_count, word_count, noindex, is_indexable, indexing_state, publication_state, page_type, source_sitemap, source_discovered, internal_inbound_link_count, structured_data, response_time_ms, html_size_bytes, internal_link_count, external_link_count"
    )
    .eq("crawl_run_id", crawlRunId);

  if (error) throw new Error(`Failed to query previous seo_page_snapshots: ${error.message}`);

  return (data ?? []).map((row): PreviousPageRecord => ({
    normalizedUrl: row.normalized_url,
    url: row.url,
    finalUrl: row.final_url,
    statusCode: row.status_code,
    title: row.title,
    metaDescription: row.meta_description,
    canonical: row.canonical,
    h1Count: row.h1_count,
    wordCount: row.word_count,
    noindex: row.noindex,
    isIndexable: row.is_indexable,
    indexingState: row.indexing_state,
    publicationState: row.publication_state,
    pageType: row.page_type,
    sourceSitemap: row.source_sitemap,
    sourceDiscovered: row.source_discovered,
    internalInboundLinkCount: row.internal_inbound_link_count,
    structuredDataTypes: Array.isArray(row.structured_data)
      ? (row.structured_data as Array<{ type: string }>).map((entry) => entry.type)
      : [],
    // Step 2.6 fields — null on rows persisted before they existed.
    htmlSizeBytes: row.html_size_bytes ?? null,
    responseTimeMs: row.response_time_ms ?? null,
    internalLinkCount: row.internal_link_count ?? null,
    externalLinkCount: row.external_link_count ?? null,
  }));
}

export async function getPreviousIssueSnapshots(client: SupabaseClient, crawlRunId: string): Promise<PreviousIssueRecord[]> {
  const { data, error } = await client
    .from("seo_issue_snapshots")
    .select("issue_key, url, issue_type, severity")
    .eq("crawl_run_id", crawlRunId);

  if (error) throw new Error(`Failed to query previous seo_issue_snapshots: ${error.message}`);

  return (data ?? []).map((row): PreviousIssueRecord => ({
    issueKey: row.issue_key,
    url: row.url,
    issueType: row.issue_type,
    severity: row.severity,
  }));
}

export async function insertChangeEvents(
  client: SupabaseClient,
  siteId: string,
  crawlRunId: string,
  previousCrawlRunId: string | null,
  changes: ChangeEvent[]
): Promise<void> {
  if (changes.length === 0) return;

  const rows = changes.map((change) => ({
    site_id: siteId,
    crawl_run_id: crawlRunId,
    previous_crawl_run_id: previousCrawlRunId,
    event_type: change.eventType,
    entity_type: change.entityType,
    url: change.url,
    issue_key: change.issueKey,
    severity: change.severity,
    field_name: change.fieldName,
    previous_value: change.previousValue,
    current_value: change.currentValue,
    message: change.message,
    metadata: change.metadata,
  }));

  const { error } = await client.from("seo_change_events").insert(rows);
  if (error) throw new Error(`Failed to insert seo_change_events rows: ${error.message}`);
}

export interface ScoreSnapshotRow {
  overall_score: number;
  overall_score_raw: number;
  technical_score: number;
  on_page_score: number;
  content_score: number;
  internal_linking_score: number;
  indexing_score: number;
  performance_score: number;
  safety_cap_applied: string | null;
  score_breakdown: unknown;
}

function scoreSnapshotRow(siteId: string, crawlRunId: string, score: ScoreResult) {
  return {
    crawl_run_id: crawlRunId,
    site_id: siteId,
    overall_score: score.overallScore,
    overall_score_raw: score.overallScoreRaw,
    // Category columns are integer; finalScore can be fractional (penalties/bonuses
    // aren't whole numbers) — full precision is preserved in score_breakdown below.
    technical_score: Math.round(score.categories.technical.finalScore),
    on_page_score: Math.round(score.categories.onPage.finalScore),
    content_score: Math.round(score.categories.content.finalScore),
    internal_linking_score: Math.round(score.categories.internalLinks.finalScore),
    indexing_score: Math.round(score.categories.indexing.finalScore),
    performance_score: Math.round(score.categories.performance.finalScore),
    safety_cap_applied: score.safetyCapApplied,
    score_breakdown: score.categories,
  };
}

/** Inserts (or, with opts.force, upserts) one score snapshot row per crawl run. crawl_run_id is unique, so a plain insert is naturally idempotent-safe against accidental double calls. */
export async function insertScoreSnapshot(
  client: SupabaseClient,
  siteId: string,
  crawlRunId: string,
  score: ScoreResult,
  opts?: { force?: boolean }
): Promise<void> {
  const row = scoreSnapshotRow(siteId, crawlRunId, score);

  const { error } = opts?.force
    ? await client.from("seo_score_snapshots").upsert(row, { onConflict: "crawl_run_id" })
    : await client.from("seo_score_snapshots").insert(row);

  if (error) throw new Error(`Failed to insert seo_score_snapshots row: ${error.message}`);
}

export async function getScoreSnapshotForCrawlRun(client: SupabaseClient, crawlRunId: string): Promise<ScoreSnapshotRow | null> {
  const { data, error } = await client
    .from("seo_score_snapshots")
    .select(
      "overall_score, overall_score_raw, technical_score, on_page_score, content_score, internal_linking_score, indexing_score, performance_score, safety_cap_applied, score_breakdown"
    )
    .eq("crawl_run_id", crawlRunId)
    .maybeSingle();

  if (error) throw new Error(`Failed to query seo_score_snapshots: ${error.message}`);
  return data ?? null;
}

export async function getScoreHistory(client: SupabaseClient, siteId: string, limit = 30): Promise<ScoreSnapshotRow[]> {
  const { data, error } = await client
    .from("seo_score_snapshots")
    .select(
      "overall_score, overall_score_raw, technical_score, on_page_score, content_score, internal_linking_score, indexing_score, performance_score, safety_cap_applied, score_breakdown, created_at, crawl_run_id"
    )
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to query seo_score_snapshots history: ${error.message}`);
  return data ?? [];
}
