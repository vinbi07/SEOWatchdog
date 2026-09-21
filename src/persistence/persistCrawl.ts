import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/config.js";
import * as repo from "../db/seoRepository.js";
import type { TriggerType } from "../db/seoRepository.js";
import { getSupabaseClient, isSupabaseConfigured } from "../db/supabaseClient.js";
import { compareCrawls, type PreviousCrawlData } from "../history/compareCrawls.js";
import type { CrawlComparisonResult } from "../history/types.js";
import { calculateSeoScore } from "../scoring/index.js";
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

export interface CrawlRunContext {
  client: SupabaseClient;
  siteId: string;
  crawlRunId: string;
}

/**
 * Creates the `seo_crawl_runs` row up front (before crawling/analysis even
 * starts) so live progress can be reported against it as the pipeline runs.
 * Returns null under exactly the same conditions persistCrawlAndCompare used
 * to silently skip persistence for (PERSIST_RESULTS off, or Supabase not
 * configured) -- callers should treat a null result as "no progress
 * reporting / no persistence this run", not an error.
 */
export async function startCrawlRun(
  site: string,
  startedAt: string,
  triggerType: TriggerType | null
): Promise<CrawlRunContext | null> {
  if (!config.persistResults) {
    return null;
  }

  if (!isSupabaseConfigured()) {
    logger.warn("PERSIST_RESULTS=true but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Skipping persistence.");
    return null;
  }

  const client = getSupabaseClient();
  const siteRow = await repo.findOrCreateSite(client, site);
  const crawlRunId = await repo.createRunningCrawlRun(client, siteRow.id, startedAt, triggerType);
  return { client, siteId: siteRow.id, crawlRunId };
}

async function reportStage(client: SupabaseClient, crawlRunId: string, stage: repo.CrawlStage): Promise<void> {
  try {
    await repo.updateCrawlRunProgress(client, crawlRunId, { stage });
  } catch (err) {
    logger.warn("Failed to update scan progress (non-fatal)", err instanceof Error ? err.message : err);
  }
}

/**
 * Persists the current crawl to Supabase (site, crawl run, immutable page +
 * issue snapshots), compares it against the previous successful crawl for
 * this site, and persists the resulting change events.
 *
 * When `existingRun` is provided (from startCrawlRun), reuses that already-
 * created crawl run row instead of creating a second one -- this is how
 * live stage progress and the final persisted result end up on the same
 * `seo_crawl_runs` row.
 *
 * Never throws: persistence problems are caught, logged, and reflected in
 * the returned status so the caller can still write a valid local
 * output/latest-crawl.json regardless of Supabase availability.
 */
export async function persistCrawlAndCompare(
  report: CrawlReport,
  existingRun?: CrawlRunContext | null
): Promise<PersistCrawlResult> {
  if (!existingRun) {
    if (!config.persistResults) {
      return { status: "skipped", crawlRunId: null, comparisonResult: null };
    }

    if (!isSupabaseConfigured()) {
      logger.warn("PERSIST_RESULTS=true but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Skipping persistence.");
      return { status: "skipped", crawlRunId: null, comparisonResult: null };
    }
  }

  const client = existingRun?.client ?? getSupabaseClient();
  let crawlRunId: string | null = existingRun?.crawlRunId ?? null;
  let siteId: string | null = existingRun?.siteId ?? null;
  let snapshotsInserted = false;

  try {
    if (!siteId || !crawlRunId) {
      const site = await repo.findOrCreateSite(client, report.site);
      siteId = site.id;
      crawlRunId = await repo.createRunningCrawlRun(client, site.id, report.crawlStartedAt);
    }

    const pageSnapshotIdByUrl = await repo.insertPageSnapshots(client, siteId, crawlRunId, report.pages);
    await repo.insertIssueSnapshots(client, siteId, crawlRunId, report.pages, pageSnapshotIdByUrl);
    snapshotsInserted = true;

    await reportStage(client, crawlRunId, "comparing");

    const previousRun = await repo.getPreviousSuccessfulCrawlRun(client, siteId, crawlRunId);
    let previousData: PreviousCrawlData | null = null;
    let previousScore: number | null = null;
    if (previousRun) {
      const [pages, issues, prevScoreSnapshot] = await Promise.all([
        repo.getPreviousPageSnapshots(client, previousRun.id),
        repo.getPreviousIssueSnapshots(client, previousRun.id),
        repo.getScoreSnapshotForCrawlRun(client, previousRun.id),
      ]);
      previousData = { crawlRunId: previousRun.id, pages, issues };
      previousScore = prevScoreSnapshot?.overall_score ?? null;
    }

    const comparisonResult = compareCrawls(report.pages, previousData);

    await reportStage(client, crawlRunId, "scoring");

    const score = calculateSeoScore(report, previousScore ?? undefined);
    await repo.insertScoreSnapshot(client, siteId, crawlRunId, score);

    await repo.insertChangeEvents(client, siteId, crawlRunId, previousData?.crawlRunId ?? null, comparisonResult.changes);
    await repo.finishCrawlRun(client, crawlRunId, {
      status: "success",
      finishedAt: report.crawlFinishedAt,
      report,
    });
    await repo.updateSiteLastSuccessfulCrawl(client, siteId, report.crawlFinishedAt);

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
