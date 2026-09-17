import type { PageResult } from "../types/seo.js";
import { compareIssues, type CurrentIssueEntry } from "./compareIssues.js";
import { comparePages } from "./comparePages.js";
import type { CrawlComparisonResult, PreviousIssueRecord, PreviousPageRecord } from "./types.js";

export interface PreviousCrawlData {
  crawlRunId: string;
  pages: PreviousPageRecord[];
  issues: PreviousIssueRecord[];
}

/**
 * Compares the current crawl against the previous successful crawl (if any).
 * When there is no previous crawl, this is a baseline: every page/issue is
 * stored normally, but no synthetic "new" events are generated for them.
 */
export function compareCrawls(currentPages: PageResult[], previous: PreviousCrawlData | null): CrawlComparisonResult {
  if (!previous) {
    return {
      comparison: {
        baseline: true,
        previousCrawlId: null,
        newIssues: 0,
        resolvedIssues: 0,
        ongoingIssues: 0,
        newPages: 0,
        removedPages: 0,
        changedPages: 0,
      },
      changes: [],
    };
  }

  const currentIssues: CurrentIssueEntry[] = currentPages.flatMap((page) =>
    page.issues.map((issue) => ({ url: page.url, issue }))
  );

  const issueResult = compareIssues(currentIssues, previous.issues);
  const pageResult = comparePages(currentPages, previous.pages);

  return {
    comparison: {
      baseline: false,
      previousCrawlId: previous.crawlRunId,
      newIssues: issueResult.newCount,
      resolvedIssues: issueResult.resolvedCount,
      ongoingIssues: issueResult.ongoingCount,
      newPages: pageResult.newPageCount,
      removedPages: pageResult.removedPageCount,
      changedPages: pageResult.changedPageCount,
    },
    changes: [...issueResult.changes, ...pageResult.changes],
  };
}
