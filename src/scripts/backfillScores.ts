import { getSupabaseClient, isSupabaseConfigured } from "../db/supabaseClient.js";
import { calculateSeoScore } from "../scoring/index.js";
import type { CrawlOutcome, CrawlReport, Issue, PageResult } from "../types/seo.js";
import { logger } from "../utils/logger.js";

/**
 * One-time (or re-runnable) backfill: computes and persists an
 * seo_score_snapshots row for every historical crawl run that doesn't have
 * one yet.
 *
 *   npm run scores:backfill [-- --force] [-- --siteId=<uuid>]
 *
 * --force re-scores and overwrites runs that already have a snapshot.
 * Without it, runs with an existing snapshot are skipped (idempotent).
 *
 * A CrawlReport is reconstructed from the immutable seo_page_snapshots /
 * seo_issue_snapshots rows for each run rather than re-derived from rules.
 * page.issues is rebuilt directly from the persisted issue snapshots (not
 * re-run through the rules engine), which is exactly what the scorer needs
 * — computeCategoryPenalties only reads page.issues, and every
 * positiveSignals.ts check only needs boolean/count fields that ARE
 * persisted. Fields that genuinely can't be reconstructed (raw link arrays,
 * per-page error messages, h3-h6 counts, redirect counts) get a documented
 * default rather than a guess — see below.
 */

function inferOutcome(statusCode: number | null): CrawlOutcome {
  if (statusCode == null) return "network_error";
  if (statusCode >= 200 && statusCode < 400) return "ok";
  return "http_error";
}

interface CrawlRunRow {
  id: string;
  site_id: string;
  started_at: string;
  finished_at: string | null;
  total_pages: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  sitemap_urls: number;
  internally_discovered_urls: number;
  discovered_not_in_sitemap: number;
  indexable_missing_from_sitemap: number;
  non_indexable_missing_from_sitemap: number;
  orphaned_sitemap_pages: number;
  indexable_count: number;
  noindex_expected_count: number;
  noindex_review_count: number;
  noindex_unexpected_count: number;
  preferred_host: string | null;
  www_redirect_status: number | null;
}

async function reconstructCrawlReport(client: ReturnType<typeof getSupabaseClient>, run: CrawlRunRow): Promise<CrawlReport> {
  const { data: pageRows, error: pageError } = await client
    .from("seo_page_snapshots")
    .select("*")
    .eq("crawl_run_id", run.id);
  if (pageError) throw new Error(`Failed to read seo_page_snapshots for run ${run.id}: ${pageError.message}`);

  const { data: issueRows, error: issueError } = await client
    .from("seo_issue_snapshots")
    .select("page_snapshot_id, url, issue_type, severity, message, recommendation, value")
    .eq("crawl_run_id", run.id);
  if (issueError) throw new Error(`Failed to read seo_issue_snapshots for run ${run.id}: ${issueError.message}`);

  const issuesByPageId = new Map<string, Issue[]>();
  for (const row of issueRows ?? []) {
    if (!row.page_snapshot_id) continue;
    const issue: Issue = {
      issueType: row.issue_type,
      severity: row.severity,
      message: row.message,
      recommendation: row.recommendation,
      url: row.url,
      value: row.value ?? undefined,
    };
    const list = issuesByPageId.get(row.page_snapshot_id);
    if (list) list.push(issue);
    else issuesByPageId.set(row.page_snapshot_id, [issue]);
  }

  const pages: PageResult[] = (pageRows ?? []).map((row): PageResult => {
    const issues = issuesByPageId.get(row.id) ?? [];
    const brokenIssue = issues.find((i) => i.issueType === "broken_internal_links");

    return {
      url: row.url,
      finalUrl: row.final_url ?? row.url,
      status: row.status_code,
      redirectCount: row.redirect_count ?? 0, // not separately reconstructable beyond what's stored; column is persisted so this is exact
      responseTimeMs: row.response_time_ms,
      outcome: inferOutcome(row.status_code), // approximation: the persisted schema doesn't distinguish network_error/disallowed_by_robots from a null status
      title: row.title,
      titleLength: row.title_length ?? 0,
      metaDescription: row.meta_description,
      metaDescriptionLength: row.meta_description_length ?? 0,
      canonical: row.canonical,
      robotsMeta: row.robots_meta ?? { raw: null, noindex: row.noindex, nofollow: row.nofollow },
      noindex: row.noindex,
      h1: [],
      h1Count: row.h1_count ?? 0,
      h2Count: row.h2_count ?? 0,
      h3Count: 0,
      h4Count: 0,
      h5Count: 0,
      h6Count: 0,
      headings: row.headings ?? [],
      wordCount: row.word_count ?? 0,
      internalLinks: [],
      externalLinks: [],
      brokenInternalLinks: Array.isArray(brokenIssue?.value) ? (brokenIssue!.value as string[]) : [],
      internalInboundLinkCount: row.internal_inbound_link_count ?? 0,
      internalOutboundLinkCount: row.internal_outbound_link_count ?? 0,
      anchorMetrics: row.anchor_metrics ?? {
        internalLinkCount: row.internal_link_count ?? 0,
        uniqueInternalLinkCount: row.unique_internal_link_count ?? 0,
        externalLinkCount: row.external_link_count ?? 0,
        uniqueExternalLinkCount: row.unique_external_link_count ?? 0,
        emptyInternalAnchorCount: 0,
        genericAnchorCount: 0,
        ambiguousAnchorTextCount: 0,
        emptyAnchorHrefSamples: [],
        genericAnchorTextSamples: [],
        ambiguousAnchorSamples: [],
      },
      duplicateContentSamples: row.duplicate_content_samples ?? [],
      images: { total: row.image_count ?? 0, missingAlt: row.images_missing_alt ?? 0 },
      openGraph: row.open_graph ?? { title: null, description: null, image: null },
      twitter: row.twitter ?? { card: null, title: null, description: null, image: null },
      structuredData: row.structured_data ?? [],
      structuredDataDetails: row.structured_data_details ?? [],
      lang: row.lang,
      hasViewport: row.has_viewport ?? false,
      hasFavicon: row.has_favicon ?? false,
      isIndexable: row.is_indexable ?? true,
      pageType: row.page_type,
      sources: { sitemap: row.source_sitemap ?? false, discovered: row.source_discovered ?? false },
      publicationState: row.publication_state,
      indexingState: row.indexing_state,
      alternateLinks: row.alternate_links ?? [],
      htmlSizeBytes: row.html_size_bytes ?? 0,
      charset: row.charset,
      hasHtml5Doctype: row.has_html5_doctype ?? false,
      compressionEncoding: row.compression_encoding,
      serverHeaders: row.server_headers ?? {
        server: null,
        xPoweredBy: null,
        contentType: null,
        cacheControl: null,
        contentSecurityPolicy: null,
        strictTransportSecurity: null,
      },
      mixedContentCount: row.mixed_content_count ?? 0,
      mixedContentSamples: [], // not persisted; count above is what scoring/rules actually need
      titlePixelWidthEstimate: row.title_pixel_width_estimate,
      metaDescriptionPixelWidthEstimate: row.meta_description_pixel_width_estimate,
      issues,
    };
  });

  return {
    site: run.site_id,
    crawlStartedAt: run.started_at,
    crawlFinishedAt: run.finished_at ?? run.started_at,
    totalPages: run.total_pages,
    hostCanonicalization: run.preferred_host ? { preferredHost: run.preferred_host, wwwRedirectStatus: run.www_redirect_status } : null,
    discovery: {
      sitemapUrls: run.sitemap_urls,
      internallyDiscoveredUrls: run.internally_discovered_urls,
      discoveredNotInSitemap: run.discovered_not_in_sitemap,
      indexableMissingFromSitemap: run.indexable_missing_from_sitemap,
      nonIndexableMissingFromSitemap: run.non_indexable_missing_from_sitemap,
      orphanedSitemapPages: run.orphaned_sitemap_pages,
    },
    indexing: {
      indexable: run.indexable_count,
      noindexExpected: run.noindex_expected_count,
      noindexReview: run.noindex_review_count,
      noindexUnexpected: run.noindex_unexpected_count,
    },
    summary: { critical: run.critical_count, high: run.high_count, medium: run.medium_count, low: run.low_count },
    siteIssues: [],
    pages,
  };
}

interface Args {
  force: boolean;
  siteId: string | null;
}

function parseArgs(argv: string[]): Args {
  const force = argv.includes("--force");
  const siteIdArg = argv.find((a) => a.startsWith("--siteId="));
  const siteId = siteIdArg ? siteIdArg.slice("--siteId=".length) : null;
  return { force, siteId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isSupabaseConfigured()) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Cannot backfill scores.");
    process.exitCode = 1;
    return;
  }

  const client = getSupabaseClient();

  let query = client
    .from("seo_crawl_runs")
    .select(
      "id, site_id, started_at, finished_at, total_pages, critical_count, high_count, medium_count, low_count, sitemap_urls, internally_discovered_urls, discovered_not_in_sitemap, indexable_missing_from_sitemap, non_indexable_missing_from_sitemap, orphaned_sitemap_pages, indexable_count, noindex_expected_count, noindex_review_count, noindex_unexpected_count, preferred_host, www_redirect_status"
    )
    .eq("status", "success")
    .order("started_at", { ascending: true });

  if (args.siteId) {
    query = query.eq("site_id", args.siteId);
  }

  const { data: runs, error } = await query;
  if (error) {
    logger.error("Failed to list crawl runs for backfill.", error.message);
    process.exitCode = 1;
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  const previousScoreBySite = new Map<string, number>();

  for (const run of runs ?? []) {
    try {
      const { data: existing, error: existingError } = await client
        .from("seo_score_snapshots")
        .select("overall_score")
        .eq("crawl_run_id", run.id)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      if (existing && !args.force) {
        skipped++;
        previousScoreBySite.set(run.site_id, existing.overall_score);
        continue;
      }

      const report = await reconstructCrawlReport(client, run);
      const previousScore = previousScoreBySite.get(run.site_id);
      const score = calculateSeoScore(report, previousScore);

      const row = {
        crawl_run_id: run.id,
        site_id: run.site_id,
        overall_score: score.overallScore,
        overall_score_raw: score.overallScoreRaw,
        // Category columns are integer; finalScore can be fractional — full
        // precision is preserved in score_breakdown below.
        technical_score: Math.round(score.categories.technical.finalScore),
        on_page_score: Math.round(score.categories.onPage.finalScore),
        content_score: Math.round(score.categories.content.finalScore),
        internal_linking_score: Math.round(score.categories.internalLinks.finalScore),
        indexing_score: Math.round(score.categories.indexing.finalScore),
        performance_score: Math.round(score.categories.performance.finalScore),
        safety_cap_applied: score.safetyCapApplied,
        score_breakdown: score.categories,
      };

      const { error: writeError } = args.force
        ? await client.from("seo_score_snapshots").upsert(row, { onConflict: "crawl_run_id" })
        : await client.from("seo_score_snapshots").insert(row);
      if (writeError) throw new Error(writeError.message);

      previousScoreBySite.set(run.site_id, score.overallScore);
      inserted++;
      logger.info(`Scored crawl run ${run.id}: ${score.overallScore}/100`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to backfill score for crawl run ${run.id}: ${message}`);
    }
  }

  logger.info(`Backfill complete. inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main();
