import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlReport } from "../types/seo.js";
import { config } from "../config/config.js";

vi.mock("../db/supabaseClient.js", () => ({
  isSupabaseConfigured: vi.fn(),
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("../db/seoRepository.js", () => ({
  findOrCreateSite: vi.fn(),
  createRunningCrawlRun: vi.fn(),
  insertPageSnapshots: vi.fn(),
  insertIssueSnapshots: vi.fn(),
  getPreviousSuccessfulCrawlRun: vi.fn(),
  getPreviousPageSnapshots: vi.fn(),
  getPreviousIssueSnapshots: vi.fn(),
  getScoreSnapshotForCrawlRun: vi.fn(),
  insertScoreSnapshot: vi.fn(),
  insertChangeEvents: vi.fn(),
  finishCrawlRun: vi.fn(),
  updateSiteLastSuccessfulCrawl: vi.fn(),
  markCrawlRunErrored: vi.fn(),
}));

const supabaseClientModule = await import("../db/supabaseClient.js");
const repo = await import("../db/seoRepository.js");
const { persistCrawlAndCompare } = await import("./persistCrawl.js");

function fixtureReport(): CrawlReport {
  return {
    site: "https://example.com",
    crawlStartedAt: "2026-01-01T00:00:00.000Z",
    crawlFinishedAt: "2026-01-01T00:01:00.000Z",
    totalPages: 0,
    hostCanonicalization: null,
    discovery: {
      sitemapUrls: 0,
      internallyDiscoveredUrls: 0,
      discoveredNotInSitemap: 0,
      indexableMissingFromSitemap: 0,
      nonIndexableMissingFromSitemap: 0,
      orphanedSitemapPages: 0,
    },
    indexing: { indexable: 0, noindexExpected: 0, noindexReview: 0, noindexUnexpected: 0 },
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    siteIssues: [],
    pages: [],
  };
}

describe("persistCrawlAndCompare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as { persistResults: boolean }).persistResults = true;
    vi.mocked(supabaseClientModule.isSupabaseConfigured).mockReturnValue(true);
  });

  it("skips persistence when PERSIST_RESULTS is false", async () => {
    (config as { persistResults: boolean }).persistResults = false;
    const result = await persistCrawlAndCompare(fixtureReport());
    expect(result.status).toBe("skipped");
    expect(repo.findOrCreateSite).not.toHaveBeenCalled();
  });

  it("skips persistence when Supabase is not configured", async () => {
    vi.mocked(supabaseClientModule.isSupabaseConfigured).mockReturnValue(false);
    const result = await persistCrawlAndCompare(fixtureReport());
    expect(result.status).toBe("skipped");
    expect(repo.findOrCreateSite).not.toHaveBeenCalled();
  });

  it("returns success and a baseline comparison on a clean first run", async () => {
    vi.mocked(repo.findOrCreateSite).mockResolvedValue({ id: "site-1", domain: "example.com", baseUrl: "https://example.com" });
    vi.mocked(repo.createRunningCrawlRun).mockResolvedValue("run-1");
    vi.mocked(repo.insertPageSnapshots).mockResolvedValue(new Map());
    vi.mocked(repo.insertIssueSnapshots).mockResolvedValue(undefined);
    vi.mocked(repo.getPreviousSuccessfulCrawlRun).mockResolvedValue(null);
    vi.mocked(repo.insertScoreSnapshot).mockResolvedValue(undefined);
    vi.mocked(repo.insertChangeEvents).mockResolvedValue(undefined);
    vi.mocked(repo.finishCrawlRun).mockResolvedValue(undefined);
    vi.mocked(repo.updateSiteLastSuccessfulCrawl).mockResolvedValue(undefined);

    const result = await persistCrawlAndCompare(fixtureReport());

    expect(result.status).toBe("success");
    expect(result.crawlRunId).toBe("run-1");
    expect(result.comparisonResult?.comparison.baseline).toBe(true);
    expect(repo.insertScoreSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      "site-1",
      "run-1",
      expect.objectContaining({ overallScore: expect.any(Number) })
    );
    expect(repo.finishCrawlRun).toHaveBeenCalledWith(
      expect.anything(),
      "run-1",
      expect.objectContaining({ status: "success" })
    );
  });

  it("marks the run partial (not failed) when snapshots were saved but a later step throws, and excludes it from future baselines", async () => {
    vi.mocked(repo.findOrCreateSite).mockResolvedValue({ id: "site-1", domain: "example.com", baseUrl: "https://example.com" });
    vi.mocked(repo.createRunningCrawlRun).mockResolvedValue("run-2");
    vi.mocked(repo.insertPageSnapshots).mockResolvedValue(new Map());
    vi.mocked(repo.insertIssueSnapshots).mockResolvedValue(undefined);
    vi.mocked(repo.getPreviousSuccessfulCrawlRun).mockRejectedValue(new Error("network blip"));
    vi.mocked(repo.markCrawlRunErrored).mockResolvedValue(undefined);

    const result = await persistCrawlAndCompare(fixtureReport());

    expect(result.status).toBe("partial");
    expect(result.comparisonResult).toBeNull();
    expect(repo.markCrawlRunErrored).toHaveBeenCalledWith(expect.anything(), "run-2", "partial", expect.any(String));

    // getPreviousSuccessfulCrawlRun itself only ever selects status = 'success' crawl runs,
    // so a 'partial' run can never be picked up as a comparison baseline by a later crawl.
  });

  it("marks the run failed when nothing was persisted at all", async () => {
    vi.mocked(repo.findOrCreateSite).mockRejectedValue(new Error("connection refused"));

    const result = await persistCrawlAndCompare(fixtureReport());

    expect(result.status).toBe("failed");
    expect(result.crawlRunId).toBeNull();
    expect(repo.markCrawlRunErrored).not.toHaveBeenCalled();
  });
});
