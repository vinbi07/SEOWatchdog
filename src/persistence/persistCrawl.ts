import { config } from "../config/config.js";
import * as repo from "../db/seoRepository.js";
import { getSupabaseClient, isSupabaseConfigured } from "../db/supabaseClient.js";
import { compareCrawls, type PreviousCrawlData } from "../history/compareCrawls.js";
import type { CrawlComparisonResult } from "../history/types.js";
import type { CrawlReport } from "../types/seo.js";
import { logger } from "../utils/logger.js";

export type PersistCrawlStatus = "skipped" | "success" | "partial" | "failed";

export interface PersistCrawlResult {
  status: PersistCrawlStatus;
  crawlRunId: string | null;
  /** null when persistence was skipped or failed before a comparison could be produced. */
  comparisonResult: CrawlComparisonResult | null;
  errorMessage?: string;
}

/**
 * Persists the current crawl to Supabase (site, crawl run, immutable page +
 * issue snapshots), compares it against the previous successful crawl for
 * this site, and persists the resulting change events.
 *
 * Never throws: persistence problems are caught, logged, and reflected in
 * the returned status so the caller can still write a valid local
 * output/latest-crawl.json regardless of Supabase availability.
 */
export async function persistCrawlAndCompare(report: CrawlReport): Promise<PersistCrawlResult> {
  if (!config.persistResults) {
    return { status: "skipped", crawlRunId: null, comparisonResult: null };
  }

  if (!isSupabaseConfigured()) {
    logger.warn("PERSIST_RESULTS=true but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Skipping persistence.");
    return { status: "skipped", crawlRunId: null, comparisonResult: null };
  }

  const client = getSupabaseClient();
  let crawlRunId: string | null = null;
  let snapshotsInserted = false;

  try {
    const site = await repo.findOrCreateSite(client, report.site);
    crawlRunId = await repo.createRunningCrawlRun(client, site.id, report.crawlStartedAt);

    const pageSnapshotIdByUrl = await repo.insertPageSnapshots(client, site.id, crawlRunId, report.pages);
    await repo.insertIssueSnapshots(client, site.id, crawlRunId, report.pages, pageSnapshotIdByUrl);
    snapshotsInserted = true;

    const previousRun = await repo.getPreviousSuccessfulCrawlRun(client, site.id, crawlRunId);
    let previousData: PreviousCrawlData | null = null;
    if (previousRun) {
      const [pages, issues] = await Promise.all([
        repo.getPreviousPageSnapshots(client, previousRun.id),
        repo.getPreviousIssueSnapshots(client, previousRun.id),
      ]);
      previousData = { crawlRunId: previousRun.id, pages, issues };
    }

    const comparisonResult = compareCrawls(report.pages, previousData);

    await repo.insertChangeEvents(client, site.id, crawlRunId, previousData?.crawlRunId ?? null, comparisonResult.changes);
    await repo.finishCrawlRun(client, crawlRunId, {
      status: "success",
      finishedAt: report.crawlFinishedAt,
      report,
    });
    await repo.updateSiteLastSuccessfulCrawl(client, site.id, report.crawlFinishedAt);

    return { status: "success", crawlRunId, comparisonResult };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("SEO Watchdog persistence failed. Local output/latest-crawl.json is unaffected.", errorMessage);

    if (crawlRunId) {
      const status = snapshotsInserted ? "partial" : "failed";
      try {
        await repo.markCrawlRunErrored(client, crawlRunId, status, errorMessage);
      } catch (markErr) {
        logger.error("Additionally failed to mark the crawl run's error status.", markErr);
      }
      return { status, crawlRunId, comparisonResult: null, errorMessage };
    }

    return { status: "failed", crawlRunId: null, comparisonResult: null, errorMessage };
  }
}
