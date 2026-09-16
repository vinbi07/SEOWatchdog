import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";
import { toDisplayPath } from "./utils/urls.js";
import { crawlSite } from "./crawler/crawler.js";
import { applyPageRules } from "./rules/rules.js";
import { findDuplicateIssues } from "./rules/duplicateRules.js";
import type { CrawlReport, CrawlSummary, Issue, Severity } from "./types/seo.js";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

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

function printConsoleSummary(report: CrawlReport): void {
  const siteLabel = new URL(report.site).hostname;

  console.log("");
  console.log("SEO WATCHDOG");
  console.log("");
  console.log(`Site: ${siteLabel}`);
  console.log(`Pages Crawled: ${report.totalPages}`);
  console.log("");
  console.log(`Critical: ${report.summary.critical}`);
  console.log(`High: ${report.summary.high}`);
  console.log(`Medium: ${report.summary.medium}`);
  console.log(`Low: ${report.summary.low}`);
  console.log("");

  const allIssues = report.pages.flatMap((page) => page.issues.map((issue) => ({ page, issue })));
  if (allIssues.length > 0) {
    console.log("Top Issues:");
    console.log("");

    const bySeverity = new Map<Severity, { page: (typeof allIssues)[number]["page"]; issue: Issue }[]>();
    for (const entry of allIssues) {
      const list = bySeverity.get(entry.issue.severity) ?? [];
      list.push(entry);
      bySeverity.set(entry.issue.severity, list);
    }

    const MAX_PER_SEVERITY = 5;
    for (const severity of SEVERITY_ORDER) {
      const entries = bySeverity.get(severity);
      if (!entries || entries.length === 0) continue;
      for (const { page, issue } of entries.slice(0, MAX_PER_SEVERITY)) {
        console.log(severity.toUpperCase());
        console.log(toDisplayPath(page.url, config.siteOrigin));
        console.log(issue.message);
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

  const pages = await crawlSite();

  for (const page of pages) {
    page.issues = applyPageRules(page);
  }

  const duplicateIssues = findDuplicateIssues(pages);
  for (const page of pages) {
    const extra = duplicateIssues.get(page.url);
    if (extra) page.issues.push(...extra);
  }

  const crawlFinishedAt = new Date().toISOString();
  const allIssues = pages.flatMap((p) => p.issues);

  const report: CrawlReport = {
    site: config.siteUrl,
    crawlStartedAt,
    crawlFinishedAt,
    totalPages: pages.length,
    summary: tallyIssues(allIssues),
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
