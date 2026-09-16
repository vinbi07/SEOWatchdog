import { describe, expect, it } from "vitest";
import { config } from "../config/config.js";
import { applyPageRules } from "./rules.js";
import { findDuplicateIssues } from "./duplicateRules.js";
import { makePage } from "./testFixtures.js";

describe("applyPageRules - missing H1", () => {
  it("flags a page with no H1 headings", () => {
    const page = makePage({ h1: [], h1Count: 0 });
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "missing_h1")).toBe(true);
  });

  it("does not flag a page with exactly one H1", () => {
    const page = makePage();
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "missing_h1")).toBe(false);
  });
});

describe("applyPageRules - missing title", () => {
  it("flags a page with no title as high severity", () => {
    const page = makePage({ title: null, titleLength: 0 });
    const issues = applyPageRules(page);
    const issue = issues.find((i) => i.issueType === "missing_title");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
  });
});

describe("applyPageRules - title length", () => {
  it("flags a title longer than 60 characters", () => {
    const longTitle = "A".repeat(75);
    const page = makePage({ title: longTitle, titleLength: longTitle.length });
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "title_too_long")).toBe(true);
  });

  it("flags a title shorter than 20 characters", () => {
    const shortTitle = "Short";
    const page = makePage({ title: shortTitle, titleLength: shortTitle.length });
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "title_too_short")).toBe(true);
  });

  it("does not flag a title within range", () => {
    const page = makePage();
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "title_too_long" || i.issueType === "title_too_short")).toBe(false);
  });
});

describe("applyPageRules - images missing alt", () => {
  it("flags pages with images missing alt text", () => {
    const page = makePage({ images: { total: 3, missingAlt: 2 } });
    const issues = applyPageRules(page);
    const issue = issues.find((i) => i.issueType === "images_missing_alt");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("low");
    expect(issue?.value).toBe(2);
  });

  it("does not flag pages with no missing alt text", () => {
    const page = makePage({ images: { total: 3, missingAlt: 0 } });
    const issues = applyPageRules(page);
    expect(issues.some((i) => i.issueType === "images_missing_alt")).toBe(false);
  });
});

describe("findDuplicateIssues - duplicate titles", () => {
  it("flags titles shared across multiple indexable pages", () => {
    const sharedTitle = "Duplicate Title Here Twenty Chars";
    const pageA = makePage({ url: `${config.siteOrigin}/a`, title: sharedTitle });
    const pageB = makePage({ url: `${config.siteOrigin}/b`, title: sharedTitle });
    const result = findDuplicateIssues([pageA, pageB]);

    expect(result.get(pageA.url)?.some((i) => i.issueType === "duplicate_title")).toBe(true);
    expect(result.get(pageB.url)?.some((i) => i.issueType === "duplicate_title")).toBe(true);
  });

  it("does not flag unique titles", () => {
    const pageA = makePage({
      url: `${config.siteOrigin}/a`,
      title: "Title A Unique Enough Chars",
      metaDescription: "Unique description A that is sufficiently descriptive for this page.",
    });
    const pageB = makePage({
      url: `${config.siteOrigin}/b`,
      title: "Title B Also Unique Enough",
      metaDescription: "Unique description B that is sufficiently descriptive for this page.",
    });
    const result = findDuplicateIssues([pageA, pageB]);

    expect(result.get(pageA.url)?.some((i) => i.issueType === "duplicate_title")).toBeFalsy();
    expect(result.get(pageB.url)?.some((i) => i.issueType === "duplicate_title")).toBeFalsy();
  });

  it("ignores non-indexable pages when detecting duplicates", () => {
    const sharedTitle = "Duplicate Title Here Twenty Chars";
    const pageA = makePage({ url: `${config.siteOrigin}/a`, title: sharedTitle, isIndexable: true });
    const pageB = makePage({ url: `${config.siteOrigin}/b`, title: sharedTitle, isIndexable: false });
    const result = findDuplicateIssues([pageA, pageB]);

    expect(result.get(pageA.url)).toBeUndefined();
  });
});
