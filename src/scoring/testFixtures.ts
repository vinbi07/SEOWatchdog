import { makePage } from "../rules/testFixtures.js";
import type { CrawlReport, Issue, PageResult, Severity } from "../types/seo.js";

export { makePage } from "../rules/testFixtures.js";

export function makeIssue(issueType: string, severity: Severity, overrides: Partial<Issue> = {}): Issue {
  return {
    issueType,
    severity,
    message: `${issueType} message`,
    recommendation: `${issueType} recommendation`,
    url: "https://example.com/",
    ...overrides,
  };
}

export function makeHomepage(overrides: Partial<PageResult> = {}): PageResult {
  return makePage({ pageType: "homepage", ...overrides });
}

/** Builds a clean CrawlReport (no issues, all positive signals) from the given pages. */
export function makeReport(pages: PageResult[], overrides: Partial<CrawlReport> = {}): CrawlReport {
  return {
    site: "https://example.com",
    crawlStartedAt: "2026-01-01T00:00:00.000Z",
    crawlFinishedAt: "2026-01-01T00:05:00.000Z",
    totalPages: pages.length,
    hostCanonicalization: { preferredHost: "example.com", wwwRedirectStatus: 301 },
    discovery: {
      sitemapUrls: pages.length,
      internallyDiscoveredUrls: pages.length,
      discoveredNotInSitemap: 0,
      indexableMissingFromSitemap: 0,
      nonIndexableMissingFromSitemap: 0,
      orphanedSitemapPages: 0,
    },
    indexing: {
      indexable: pages.length,
      noindexExpected: 0,
      noindexReview: 0,
      noindexUnexpected: 0,
    },
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    siteIssues: [],
    pages,
    ...overrides,
  };
}
