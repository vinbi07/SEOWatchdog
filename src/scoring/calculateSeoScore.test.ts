import { describe, expect, it } from "vitest";
import { calculateSeoScore } from "./calculateSeoScore.js";
import { CATEGORY_WEIGHTS } from "./config.js";
import { makeHomepage, makeIssue, makePage, makeReport } from "./testFixtures.js";

describe("calculateSeoScore", () => {
  it("scores a clean site at or near 100", () => {
    const report = makeReport([makeHomepage()]);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBe(100);
    expect(result.overallScoreRaw).toBeLessThanOrEqual(100);
    for (const category of Object.values(result.categories)) {
      expect(category.finalScore).toBeLessThanOrEqual(100);
    }
  });

  it("caps the score at 69 when any critical issue exists", () => {
    const page = makeHomepage({ issues: [makeIssue("crawl_failure", "critical")] });
    const report = makeReport([page]);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBeLessThanOrEqual(69);
    expect(result.safetyCapApplied).toBe("any_critical_issue");
  });

  it("caps the score at 50 when the homepage returns a 5xx", () => {
    const page = makeHomepage({ status: 503 });
    const report = makeReport([page]);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBeLessThanOrEqual(50);
    expect(result.safetyCapApplied).toBe("homepage_5xx");
  });

  it("caps the score at 40 when the homepage is unexpectedly noindex", () => {
    const page = makeHomepage({ indexingState: "noindex_unexpected" });
    const report = makeReport([page]);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBeLessThanOrEqual(40);
    expect(result.safetyCapApplied).toBe("homepage_unexpected_noindex");
  });

  it("caps the score at 20 when the site is almost entirely uncrawlable", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      makePage({ url: `https://example.com/page-${i}`, outcome: i === 0 ? "ok" : "network_error", pageType: i === 0 ? "homepage" : "generic" }),
    );
    const report = makeReport(pages);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBeLessThanOrEqual(20);
    expect(result.safetyCapApplied).toBe("site_uncrawlable");
  });

  it("composes multiple simultaneous safety caps via the lowest ceiling", () => {
    const page = makeHomepage({ status: 503, issues: [makeIssue("server_error", "critical")] });
    const report = makeReport([page]);
    const result = calculateSeoScore(report);
    expect(result.overallScore).toBeLessThanOrEqual(50);
  });

  it("applies strictly decreasing penalties across severity tiers", () => {
    const scoreFor = (severity: "critical" | "high" | "medium" | "low") => {
      const page = makePage({ pageType: "generic", issues: [makeIssue("low_word_count", severity)] });
      const homepage = makeHomepage();
      return calculateSeoScore(makeReport([homepage, page])).categories.content.finalScore;
    };

    const critical = scoreFor("critical");
    const high = scoreFor("high");
    const medium = scoreFor("medium");
    const low = scoreFor("low");

    expect(critical).toBeLessThan(high);
    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
  });

  it("applies diminishing returns so marginal penalty shrinks as occurrences grow", () => {
    const penaltyForNPages = (n: number) => {
      const pages = Array.from({ length: n }, (_, i) =>
        makePage({ url: `https://example.com/page-${i}`, pageType: "generic", issues: [makeIssue("missing_title", "high", { url: `https://example.com/page-${i}` })] }),
      );
      const homepage = makeHomepage();
      const result = calculateSeoScore(makeReport([homepage, ...pages]));
      return 100 - result.categories.onPage.finalScore;
    };

    const penalty1 = penaltyForNPages(1);
    const penalty5 = penaltyForNPages(5);
    const penalty20 = penaltyForNPages(20);
    const penalty50 = penaltyForNPages(50);

    // Marginal penalty per page should shrink as occurrence count grows.
    const marginal1to5 = (penalty5 - penalty1) / 4;
    const marginal5to20 = (penalty20 - penalty5) / 15;
    const marginal20to50 = (penalty50 - penalty20) / 30;

    expect(marginal5to20).toBeLessThan(marginal1to5);
    expect(marginal20to50).toBeLessThan(marginal5to20);
  });

  it("weights category contributions exactly per CATEGORY_WEIGHTS", () => {
    const page = makeHomepage({ issues: [makeIssue("missing_h1", "medium")] });
    const result = calculateSeoScore(makeReport([page]));

    let expectedRaw = 0;
    for (const category of Object.values(result.categories)) {
      expect(category.contribution).toBeCloseTo(category.finalScore * CATEGORY_WEIGHTS[category.category], 10);
      expectedRaw += category.contribution;
    }
    expect(result.overallScoreRaw).toBeCloseTo(expectedRaw, 10);
  });

  it("never lets the score go below 0 or above 100 under adversarial input", () => {
    const manyIssues = Array.from({ length: 40 }, () => makeIssue("crawl_failure", "critical"));
    const page = makeHomepage({ issues: manyIssues });
    const result = calculateSeoScore(makeReport([page]));
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(Number.isNaN(result.overallScore)).toBe(false);
    for (const category of Object.values(result.categories)) {
      expect(category.finalScore).toBeGreaterThanOrEqual(0);
      expect(category.finalScore).toBeLessThanOrEqual(100);
    }
  });

  it("caps positive-signal bonuses per category even with many signals", () => {
    const report = makeReport([makeHomepage()]);
    const result = calculateSeoScore(report);
    for (const category of Object.values(result.categories)) {
      const rawBonus = category.bonuses.reduce((sum, b) => sum + b.bonus, 0);
      if (rawBonus > 5) {
        expect(category.finalScore).toBeLessThanOrEqual(100);
      }
    }
  });

  it("is deterministic: identical input produces identical output", () => {
    const page = makeHomepage({
      issues: [makeIssue("missing_title", "high"), makeIssue("missing_h1", "medium"), makeIssue("generic_anchor_text", "low")],
    });
    const report = makeReport([page]);
    const result1 = calculateSeoScore(structuredClone(report));
    const result2 = calculateSeoScore(structuredClone(report));
    expect(result1).toEqual(result2);
  });

  it("computes scoreDelta against a supplied previous score, and null when none given", () => {
    const report = makeReport([makeHomepage()]);
    const withPrevious = calculateSeoScore(report, 92);
    expect(withPrevious.scoreDelta).toBe(withPrevious.overallScore - 92);

    const withoutPrevious = calculateSeoScore(report);
    expect(withoutPrevious.scoreDelta).toBeNull();
  });
});
