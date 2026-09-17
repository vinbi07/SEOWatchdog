import { describe, expect, it } from "vitest";
import { findHreflangIssues } from "./hreflangRules.js";

const URL = "https://example.com/page";

describe("findHreflangIssues", () => {
  it("does not flag a page with no alternate links at all", () => {
    expect(findHreflangIssues([], URL)).toHaveLength(0);
  });

  it("accepts a valid alternate link", () => {
    const issues = findHreflangIssues([{ hreflang: "en-US", href: "https://example.com/en/page" }], URL);
    expect(issues).toHaveLength(0);
  });

  it("flags a malformed hreflang value", () => {
    const issues = findHreflangIssues([{ hreflang: "english", href: "https://example.com/en/page" }], URL);
    expect(issues.some((i) => i.issueType === "invalid_hreflang")).toBe(true);
  });

  it("flags an alternate link missing an href", () => {
    const issues = findHreflangIssues([{ hreflang: "en", href: "" }], URL);
    expect(issues.some((i) => i.issueType === "hreflang_missing_href")).toBe(true);
  });

  it("flags the same language declared twice with different URLs", () => {
    const issues = findHreflangIssues(
      [
        { hreflang: "en", href: "https://example.com/en/a" },
        { hreflang: "en", href: "https://example.com/en/b" },
      ],
      URL
    );
    expect(issues.some((i) => i.issueType === "hreflang_duplicate_language")).toBe(true);
  });

  it("does not flag the same language repeated with the identical URL", () => {
    const issues = findHreflangIssues(
      [
        { hreflang: "en", href: "https://example.com/en/a" },
        { hreflang: "en", href: "https://example.com/en/a" },
      ],
      URL
    );
    expect(issues.some((i) => i.issueType === "hreflang_duplicate_language")).toBe(false);
  });

  it("accepts x-default", () => {
    const issues = findHreflangIssues([{ hreflang: "x-default", href: "https://example.com/" }], URL);
    expect(issues.some((i) => i.issueType === "invalid_hreflang")).toBe(false);
  });
});
