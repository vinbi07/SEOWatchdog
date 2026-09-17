import { describe, expect, it } from "vitest";
import { countOccurrencesByIssueType, occurrenceMultiplier } from "./diminishingReturns.js";

describe("occurrenceMultiplier", () => {
  it("returns the full multiplier for the 1st occurrence", () => {
    expect(occurrenceMultiplier(1)).toBe(1.0);
  });

  it("returns the tier-2 multiplier for occurrences 2-5", () => {
    expect(occurrenceMultiplier(2)).toBe(0.75);
    expect(occurrenceMultiplier(5)).toBe(0.75);
  });

  it("returns the tier-3 multiplier for occurrences 6-20", () => {
    expect(occurrenceMultiplier(6)).toBe(0.4);
    expect(occurrenceMultiplier(20)).toBe(0.4);
  });

  it("returns the tier-4 multiplier for occurrences beyond 20", () => {
    expect(occurrenceMultiplier(21)).toBe(0.2);
    expect(occurrenceMultiplier(1000)).toBe(0.2);
  });
});

describe("countOccurrencesByIssueType", () => {
  it("counts issueType occurrences across all pages", () => {
    const pages = [
      { issues: [{ issueType: "missing_title" }, { issueType: "missing_h1" }] },
      { issues: [{ issueType: "missing_title" }] },
    ];
    const counts = countOccurrencesByIssueType(pages);
    expect(counts.get("missing_title")).toBe(2);
    expect(counts.get("missing_h1")).toBe(1);
  });

  it("returns an empty map for a report with no issues", () => {
    const counts = countOccurrencesByIssueType([{ issues: [] }]);
    expect(counts.size).toBe(0);
  });
});
