import { describe, expect, it } from "vitest";
import { applySafetyCaps, buildSafetyCapContext } from "./safetyCaps.js";
import { makeHomepage, makeIssue, makePage, makeReport } from "./testFixtures.js";

describe("buildSafetyCapContext", () => {
  it("detects a critical issue anywhere in the crawl", () => {
    const page = makeHomepage({ issues: [makeIssue("crawl_failure", "critical")] });
    const ctx = buildSafetyCapContext(makeReport([page]));
    expect(ctx.hasCriticalIssue).toBe(true);
  });

  it("detects a homepage 5xx", () => {
    const page = makeHomepage({ status: 502 });
    const ctx = buildSafetyCapContext(makeReport([page]));
    expect(ctx.homepageServerError).toBe(true);
  });

  it("detects an unexpectedly noindex homepage", () => {
    const page = makeHomepage({ indexingState: "noindex_unexpected" });
    const ctx = buildSafetyCapContext(makeReport([page]));
    expect(ctx.homepageUnexpectedNoindex).toBe(true);
  });

  it("computes the uncrawlable ratio across all pages", () => {
    const pages = [
      makeHomepage(),
      makePage({ url: "https://example.com/a", pageType: "generic", outcome: "network_error" }),
    ];
    const ctx = buildSafetyCapContext(makeReport(pages));
    expect(ctx.uncrawlableRatio).toBe(0.5);
  });
});

describe("applySafetyCaps", () => {
  it("leaves the score untouched when no cap applies", () => {
    const ctx = { hasCriticalIssue: false, homepageServerError: false, homepageUnexpectedNoindex: false, uncrawlableRatio: 0 };
    const result = applySafetyCaps(95, ctx);
    expect(result.cappedScore).toBe(95);
    expect(result.capApplied).toBeNull();
  });

  it("applies a single matching cap", () => {
    const ctx = { hasCriticalIssue: true, homepageServerError: false, homepageUnexpectedNoindex: false, uncrawlableRatio: 0 };
    const result = applySafetyCaps(95, ctx);
    expect(result.cappedScore).toBe(69);
    expect(result.capApplied).toBe("any_critical_issue");
  });

  it("takes the lowest ceiling when multiple caps apply", () => {
    const ctx = { hasCriticalIssue: true, homepageServerError: true, homepageUnexpectedNoindex: false, uncrawlableRatio: 0 };
    const result = applySafetyCaps(95, ctx);
    expect(result.cappedScore).toBe(50);
  });

  it("never raises the score above its raw value", () => {
    const ctx = { hasCriticalIssue: false, homepageServerError: false, homepageUnexpectedNoindex: false, uncrawlableRatio: 0 };
    const result = applySafetyCaps(30, ctx);
    expect(result.cappedScore).toBe(30);
  });
});
