import { describe, expect, it } from "vitest";
import { makePage } from "../rules/testFixtures.js";
import { compareCrawls, type PreviousCrawlData } from "./compareCrawls.js";

describe("compareCrawls", () => {
  it("treats a missing previous crawl as a baseline with no synthetic events", () => {
    const pages = [makePage(), makePage({ url: "https://example.com/second" })];
    const result = compareCrawls(pages, null);

    expect(result.comparison.baseline).toBe(true);
    expect(result.comparison.previousCrawlId).toBeNull();
    expect(result.comparison.newIssues).toBe(0);
    expect(result.comparison.newPages).toBe(0);
    expect(result.changes).toHaveLength(0);
  });

  it("produces a non-baseline comparison when a previous crawl exists", () => {
    const pages = [makePage()];
    const previous: PreviousCrawlData = { crawlRunId: "prev-1", pages: [], issues: [] };
    const result = compareCrawls(pages, previous);

    expect(result.comparison.baseline).toBe(false);
    expect(result.comparison.previousCrawlId).toBe("prev-1");
    expect(result.comparison.newPages).toBe(1);
  });
});
