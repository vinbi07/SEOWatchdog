import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";
import { toDisplayPath } from "./utils/urls.js";
import { crawlSite } from "./crawler/crawler.js";
import { applyPageRules } from "./rules/rules.js";
import { findDuplicateIssues } from "./rules/duplicateRules.js";
import { findCoverageIssues } from "./rules/coverageRules.js";
import { analyzeIndexingState } from "./indexing/analyzeIndexingState.js";
import type { CrawlReport, CrawlSummary, IndexingSummary, Issue, Severity } from "./types/seo.js";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
const COVERAGE_ISSUE_TYPES = new Set(["indexable_page_missing_from_sitemap", "orphaned_sitemap_page"]);
const MAX_EXAMPLES = 5;
const MAX_PER_SEVERITY = 5;

function emptySummary(): CrawlSummary {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

function tallyIssues(issues: Issue[]): CrawlSummary {
  const summary = emptySummary();
  for (const issue of issues) {
    summary[issue.severity] += 1;
  }
  return summary;
}

function tallyIndexingStates(pages: CrawlReport["pages"]): IndexingSummary {
  const summary: IndexingSummary = { indexable: 0, noindexExpected: 0, noindexReview: 0, noindexUnexpected: 0 };
  for (const page of pages) {
    switch (page.indexingState) {
      case "indexable":
        summary.indexable += 1;
        break;
      case "noindex_expected":
        summary.noindexExpected += 1;
        break;
      case "noindex_review":
        summary.noindexReview += 1;
        break;
      case "noindex_unexpected":
        summary.noindexUnexpected += 1;
        break;
    }
  }
  return summary;
}

function printConsoleSummary(report: CrawlReport): void {
  console.log("");
  console.log("SEO WATCHDOG");
  console.log("");
  console.log(`Site:`);
  console.log(report.site);
  console.log("");
  console.log(`Pages Crawled: ${report.totalPages}`);
  console.log("");
  console.log(`Sitemap URLs: ${report.discovery.sitemapUrls}`);
  console.log(`Internally Discovered: ${report.discovery.internallyDiscoveredUrls}`);
  console.log(`Discovered Not In Sitemap: ${report.discovery.discoveredNotInSitemap}`);
  console.log(`  Indexable Missing From Sitemap: ${report.discovery.indexableMissingFromSitemap}`);
  console.log(`  Non-Indexable (informational): ${report.discovery.nonIndexableMissingFromSitemap}`);
  console.log(`Orphaned Sitemap Pages: ${report.discovery.orphanedSitemapPages}`);
  console.log("");
  console.log(`Critical: ${report.summary.critical}`);
  console.log(`High: ${report.summary.high}`);
  console.log(`Medium: ${report.summary.medium}`);
  console.log(`Low: ${report.summary.low}`);
  console.log("");

  console.log("INDEXING");
  console.log("");
  console.log(`Indexable Pages: ${report.indexing.indexable}`);
  console.log(`Expected Noindex: ${report.indexing.noindexExpected}`);
  console.log(`Noindex Needs Review: ${report.indexing.noindexReview}`);
  console.log(`Unexpected Noindex: ${report.indexing.noindexUnexpected}`);
  console.log("");

  const allEntries = report.pages.flatMap((page) => page.issues.map((issue) => ({ page, issue })));
  const coverageEntries = allEntries.filter((e) => COVERAGE_ISSUE_TYPES.has(e.issue.issueType));
  const pageEntries = allEntries.filter((e) => !COVERAGE_ISSUE_TYPES.has(e.issue.issueType));

  if (coverageEntries.length > 0) {
    console.log("SITEMAP COVERAGE");
    console.log("");

    const byType = new Map<string, typeof coverageEntries>();
    for (const entry of coverageEntries) {
      const list = byType.get(entry.issue.issueType) ?? [];
      list.push(entry);
      byType.set(entry.issue.issueType, list);
    }

    for (const [issueType, entries] of byType) {
      const severity = entries[0]!.issue.severity;
      console.log(severity.toUpperCase());
      const label =
        issueType === "indexable_page_missing_from_sitemap"
          ? `${entries.length} indexable internally linked page(s) missing from the sitemap.`
          : `${entries.length} sitemap page(s) with no internal links pointing to them.`;
      console.log(label);
      console.log("");
      console.log("Examples:");
      console.log("");
      for (const { page } of entries.slice(0, MAX_EXAMPLES)) {
        console.log(`* ${toDisplayPath(page.url, config.siteOrigin)}`);
      }
      if (entries.length > MAX_EXAMPLES) {
        console.log(`* ... and ${entries.length - MAX_EXAMPLES} more`);
      }
      console.log("");
    }
  }

  if (pageEntries.length > 0) {
    console.log("PAGE ISSUES");
    console.log("");

    const bySeverity = new Map<Severity, typeof pageEntries>();
    for (const entry of pageEntries) {
      const list = bySeverity.get(entry.issue.severity) ?? [];
      list.push(entry);
      bySeverity.set(entry.issue.severity, list);
    }

    for (const severity of SEVERITY_ORDER) {
      const entries = bySeverity.get(severity);
      if (!entries || entries.length === 0) continue;
      for (const { page, issue } of entries.slice(0, MAX_PER_SEVERITY)) {
        console.log(severity.toUpperCase());
        console.log("");
        console.log(toDisplayPath(page.url, config.siteOrigin));
        console.log("");
        console.log(issue.message);
        if (severity === "high" || severity === "critical") {
          console.log("");
          console.log("Recommendation:");
          console.log(issue.recommendation);
        }
        console.log("");
      }
      if (entries.length > MAX_PER_SEVERITY) {
        console.log(`... and ${entries.length - MAX_PER_SEVERITY} more ${severity} issue(s)`);
        console.log("");
      }
    }
  }

  console.log(`Report saved to:`);
  console.log(config.outputFile);
  console.log("");
}

async function main(): Promise<void> {
  const crawlStartedAt = new Date().toISOString();
  logger.info(`Starting SEO Watchdog audit for ${config.siteUrl}`);

  const { pages, sitemapUrls } = await crawlSite();

  for (const page of pages) {
    page.issues = applyPageRules(page);
  }

  const duplicateIssues = findDuplicateIssues(pages);
  for (const page of pages) {
    const extra = duplicateIssues.get(page.url);
    if (extra) page.issues.push(...extra);
  }

  const coverage = findCoverageIssues(pages, sitemapUrls);
  for (const page of pages) {
    const extra = coverage.issuesByUrl.get(page.url);
    if (extra) page.issues.push(...extra);
  }

  for (const page of pages) {
    const { indexingState, issues } = analyzeIndexingState(page);
    page.indexingState = indexingState;
    if (issues.length > 0) page.issues.push(...issues);
  }

  const crawlFinishedAt = new Date().toISOString();
  const allIssues = pages.flatMap((p) => p.issues);

  const report: CrawlReport = {
    site: config.siteUrl,
    crawlStartedAt,
    crawlFinishedAt,
    totalPages: pages.length,
    discovery: {
      sitemapUrls: sitemapUrls.size,
      internallyDiscoveredUrls: pages.length,
      discoveredNotInSitemap: coverage.discoveredNotInSitemapCount,
      indexableMissingFromSitemap: coverage.indexableMissingFromSitemapCount,
      nonIndexableMissingFromSitemap: coverage.nonIndexableMissingFromSitemapCount,
      orphanedSitemapPages: coverage.orphanedSitemapPageCount,
    },
    indexing: tallyIndexingStates(pages),
    summary: tallyIssues(allIssues),
    siteIssues: [],
    pages,
  };

  await mkdir(path.dirname(config.outputFile), { recursive: true });
  await writeFile(config.outputFile, JSON.stringify(report, null, 2), "utf-8");

  printConsoleSummary(report);
}

main().catch((err) => {
  logger.error("SEO Watchdog audit failed", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
