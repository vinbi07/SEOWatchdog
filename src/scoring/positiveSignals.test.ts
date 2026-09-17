import { describe, expect, it } from "vitest";
import { computePositiveSignals } from "./positiveSignals.js";
import { makeHomepage, makeIssue, makeReport } from "./testFixtures.js";

describe("computePositiveSignals", () => {
  it("grants the https bonus when the homepage is served over https", () => {
    const bonuses = computePositiveSignals(makeReport([makeHomepage()]));
    expect(bonuses.some((b) => b.signal === "https_enabled" && b.category === "technical")).toBe(true);
  });

  it("withholds the https bonus when the homepage is not https", () => {
    const page = makeHomepage({ finalUrl: "http://example.com/" });
    const bonuses = computePositiveSignals(makeReport([page]));
    expect(bonuses.some((b) => b.signal === "https_enabled")).toBe(false);
  });

  it("withholds the canonical bonus when a canonical issue exists anywhere", () => {
    const page = makeHomepage({ issues: [makeIssue("missing_canonical", "high")] });
    const bonuses = computePositiveSignals(makeReport([page]));
    expect(bonuses.some((b) => b.signal === "valid_canonicals")).toBe(false);
  });

  it("withholds the broken-links bonus when any page has broken internal links", () => {
    const page = makeHomepage({ brokenInternalLinks: ["https://example.com/dead"] });
    const bonuses = computePositiveSignals(makeReport([page]));
    expect(bonuses.some((b) => b.signal === "no_broken_links")).toBe(false);
  });

  it("withholds the alt-text bonus when any page has images missing alt text", () => {
    const page = makeHomepage({ images: { total: 3, missingAlt: 1 } });
    const bonuses = computePositiveSignals(makeReport([page]));
    expect(bonuses.some((b) => b.signal === "all_images_have_alt_text")).toBe(false);
  });

  it("grants the sitemap-coverage bonus when discovery reports no gaps", () => {
    const bonuses = computePositiveSignals(makeReport([makeHomepage()]));
    expect(bonuses.some((b) => b.signal === "valid_sitemap_coverage" && b.category === "indexing")).toBe(true);
  });
});
