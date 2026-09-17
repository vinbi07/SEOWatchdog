import { describe, expect, it } from "vitest";
import type { AnchorMetrics } from "../types/seo.js";
import { findAnchorIssues } from "./anchorRules.js";

const URL = "https://example.com/page";

function metrics(overrides: Partial<AnchorMetrics> = {}): AnchorMetrics {
  return {
    internalLinkCount: 0,
    uniqueInternalLinkCount: 0,
    externalLinkCount: 0,
    uniqueExternalLinkCount: 0,
    emptyInternalAnchorCount: 0,
    genericAnchorCount: 0,
    ambiguousAnchorTextCount: 0,
    emptyAnchorHrefSamples: [],
    genericAnchorTextSamples: [],
    ambiguousAnchorSamples: [],
    ...overrides,
  };
}

describe("findAnchorIssues", () => {
  it("flags empty internal anchors", () => {
    const issues = findAnchorIssues(metrics({ emptyInternalAnchorCount: 2, emptyAnchorHrefSamples: ["/a", "/b"] }), URL);
    expect(issues.some((i) => i.issueType === "empty_internal_anchor" && i.severity === "medium")).toBe(true);
  });

  it("flags generic anchor text", () => {
    const issues = findAnchorIssues(metrics({ genericAnchorCount: 1, genericAnchorTextSamples: ["click here"] }), URL);
    expect(issues.some((i) => i.issueType === "generic_anchor_text" && i.severity === "low")).toBe(true);
  });

  it("does not flag anything for clean metrics", () => {
    expect(findAnchorIssues(metrics(), URL)).toHaveLength(0);
  });

  it("flags ambiguous repeated anchor text", () => {
    const issues = findAnchorIssues(
      metrics({ ambiguousAnchorTextCount: 1, ambiguousAnchorSamples: [{ text: "details", destinations: ["/a", "/b", "/c"] }] }),
      URL
    );
    expect(issues.some((i) => i.issueType === "ambiguous_repeated_anchor_text")).toBe(true);
  });
});
