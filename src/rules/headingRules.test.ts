import { describe, expect, it } from "vitest";
import { findHeadingIssues } from "./headingRules.js";

const URL = "https://example.com/page";

describe("findHeadingIssues - duplicate heading text", () => {
  it("flags heading text repeated twice", () => {
    const headings = [
      { level: 1 as const, text: "Welcome" },
      { level: 2 as const, text: "Latest Episodes" },
      { level: 3 as const, text: "Latest Episodes" },
    ];
    const issues = findHeadingIssues(headings, 500, URL);
    expect(issues.some((i) => i.issueType === "duplicate_heading_text")).toBe(true);
  });

  it("normalizes case and whitespace before comparing", () => {
    const headings = [
      { level: 2 as const, text: "  Our   Team " },
      { level: 2 as const, text: "our team" },
    ];
    const issues = findHeadingIssues(headings, 500, URL);
    expect(issues.some((i) => i.issueType === "duplicate_heading_text")).toBe(true);
  });

  it("does not flag text repeated 4+ times (likely a repeated card/grid component)", () => {
    const headings = Array.from({ length: 4 }, () => ({ level: 3 as const, text: "Read More" }));
    const issues = findHeadingIssues(headings, 500, URL);
    expect(issues.some((i) => i.issueType === "duplicate_heading_text")).toBe(false);
  });

  it("does not flag distinct heading text", () => {
    const headings = [
      { level: 1 as const, text: "Home" },
      { level: 2 as const, text: "About" },
    ];
    expect(findHeadingIssues(headings, 500, URL).some((i) => i.issueType === "duplicate_heading_text")).toBe(false);
  });
});

describe("findHeadingIssues - hierarchy skips", () => {
  it("flags H1 -> H3 with no H2 between them", () => {
    const headings = [
      { level: 1 as const, text: "Title" },
      { level: 3 as const, text: "Detail" },
    ];
    const issues = findHeadingIssues(headings, 500, URL);
    expect(issues.some((i) => i.issueType === "heading_hierarchy_skip")).toBe(true);
  });

  it("does not flag a valid, consecutive hierarchy", () => {
    const headings = [
      { level: 1 as const, text: "Title" },
      { level: 2 as const, text: "Section" },
      { level: 3 as const, text: "Subsection" },
    ];
    expect(findHeadingIssues(headings, 500, URL).some((i) => i.issueType === "heading_hierarchy_skip")).toBe(false);
  });

  it("does not flag levels moving back up (closing a section)", () => {
    const headings = [
      { level: 1 as const, text: "Title" },
      { level: 3 as const, text: "Detail" },
    ];
    // The H1->H3 skip above is expected; a subsequent H3->H1 should not add another.
    const withReturn = [...headings, { level: 1 as const, text: "New Section" }];
    const skipCount = findHeadingIssues(withReturn, 500, URL).filter((i) => i.issueType === "heading_hierarchy_skip").length;
    expect(skipCount).toBe(1);
  });
});

describe("findHeadingIssues - excessive headings", () => {
  it("flags a very high heading-to-content ratio", () => {
    const headings = Array.from({ length: 10 }, (_, i) => ({ level: 2 as const, text: `Item ${i}` }));
    const issues = findHeadingIssues(headings, 40, URL); // 10 headings / 40 words
    expect(issues.some((i) => i.issueType === "excessive_headings")).toBe(true);
  });

  it("does not flag a normal page", () => {
    const headings = [
      { level: 1 as const, text: "Title" },
      { level: 2 as const, text: "Section" },
    ];
    expect(findHeadingIssues(headings, 500, URL).some((i) => i.issueType === "excessive_headings")).toBe(false);
  });

  it("does not flag a small/thin page even with a high ratio", () => {
    const headings = [
      { level: 2 as const, text: "A" },
      { level: 2 as const, text: "B" },
      { level: 2 as const, text: "C" },
    ];
    expect(findHeadingIssues(headings, 10, URL).some((i) => i.issueType === "excessive_headings")).toBe(false);
  });
});
