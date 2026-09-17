import { describe, expect, it } from "vitest";
import {
  compareSeverityThenUrl,
  computeCrawlFreshness,
  computeOverallStatus,
  summarizeChangesByCrawl,
  summarizeSinceLastCrawl,
} from "./aggregate.js";

describe("summarizeSinceLastCrawl", () => {
  it("counts each event type and dedupes changed pages by url", () => {
    const summary = summarizeSinceLastCrawl([
      { event_type: "issue_new", entity_type: "issue", url: "/booking", severity: "medium" },
      { event_type: "issue_new", entity_type: "issue", url: "/x", severity: "low" },
      { event_type: "issue_resolved", entity_type: "issue", url: "/booking", severity: "medium" },
      { event_type: "page_new", entity_type: "page", url: "/new", severity: null },
      { event_type: "page_removed", entity_type: "page", url: "/gone", severity: null },
      { event_type: "field_changed", entity_type: "page", url: "/", severity: null },
      { event_type: "canonical_changed", entity_type: "page", url: "/", severity: null },
    ]);

    expect(summary).toEqual({
      newIssues: 2,
      resolvedIssues: 1,
      ongoingIssues: 0,
      newPages: 1,
      removedPages: 1,
      changedPages: 1, // "/" changed twice but counts once
    });
  });

  it("returns all zeros for an empty change list", () => {
    expect(summarizeSinceLastCrawl([])).toEqual({
      newIssues: 0,
      resolvedIssues: 0,
      ongoingIssues: 0,
      newPages: 0,
      removedPages: 0,
      changedPages: 0,
    });
  });
});

describe("compareSeverityThenUrl", () => {
  it("sorts critical before high before medium before low", () => {
    const items = [
      { severity: "low", url: "/b" },
      { severity: "critical", url: "/a" },
      { severity: "medium", url: "/c" },
      { severity: "high", url: "/d" },
    ];
    items.sort(compareSeverityThenUrl);
    expect(items.map((i) => i.severity)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("breaks ties within the same severity by url", () => {
    const items = [
      { severity: "high", url: "/z" },
      { severity: "high", url: "/a" },
    ];
    items.sort(compareSeverityThenUrl);
    expect(items.map((i) => i.url)).toEqual(["/a", "/z"]);
  });
});

describe("computeOverallStatus", () => {
  const base = { criticalCount: 0, highCount: 0, noindexUnexpectedCount: 0, majorHttpFailureCount: 0, newIssuesSinceLastCrawl: 0 };

  it("is healthy when nothing is wrong", () => {
    expect(computeOverallStatus(base)).toBe("healthy");
  });

  it("is critical when there are critical issues", () => {
    expect(computeOverallStatus({ ...base, criticalCount: 1 })).toBe("critical");
  });

  it("is critical when there is unexpected noindex, even with no critical issues", () => {
    expect(computeOverallStatus({ ...base, noindexUnexpectedCount: 1 })).toBe("critical");
  });

  it("is critical when there is a major HTTP failure", () => {
    expect(computeOverallStatus({ ...base, majorHttpFailureCount: 1 })).toBe("critical");
  });

  it("is needs_attention when there are high issues but no critical ones", () => {
    expect(computeOverallStatus({ ...base, highCount: 3 })).toBe("needs_attention");
  });

  it("is needs_attention when new issues appeared since the last crawl", () => {
    expect(computeOverallStatus({ ...base, newIssuesSinceLastCrawl: 2 })).toBe("needs_attention");
  });

  it("critical takes priority over needs_attention", () => {
    expect(computeOverallStatus({ ...base, criticalCount: 1, highCount: 5 })).toBe("critical");
  });
});

describe("computeCrawlFreshness", () => {
  it("returns null when there is no last crawl", () => {
    expect(computeCrawlFreshness(null, new Date(), 24)).toBeNull();
  });

  it("is not stale within the threshold", () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const tenMinutesAgo = new Date("2026-09-17T11:50:00Z").toISOString();
    const result = computeCrawlFreshness(tenMinutesAgo, now, 24);
    expect(result).toEqual({ minutesAgo: 10, isStale: false });
  });

  it("is stale past the threshold", () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const twoDaysAgo = new Date("2026-09-15T12:00:00Z").toISOString();
    const result = computeCrawlFreshness(twoDaysAgo, now, 24);
    expect(result?.isStale).toBe(true);
  });
});

describe("summarizeChangesByCrawl", () => {
  it("groups and counts per crawl run", () => {
    const result = summarizeChangesByCrawl([
      { crawl_run_id: "run1", event_type: "issue_new", entity_type: "issue", url: "/a" },
      { crawl_run_id: "run1", event_type: "issue_resolved", entity_type: "issue", url: "/b" },
      { crawl_run_id: "run1", event_type: "field_changed", entity_type: "page", url: "/c" },
      { crawl_run_id: "run2", event_type: "page_new", entity_type: "page", url: "/d" },
    ]);

    expect(result.run1).toEqual({ newIssues: 1, resolvedIssues: 1, changedPages: 1, total: 3 });
    expect(result.run2).toEqual({ newIssues: 0, resolvedIssues: 0, changedPages: 0, total: 0 });
  });
});
