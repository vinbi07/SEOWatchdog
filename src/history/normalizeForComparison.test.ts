import { describe, expect, it } from "vitest";
import {
  internalInboundLinkCountChangedSignificantly,
  normalizeStructuredDataTypes,
  normalizeUrlForComparison,
  structuredDataTypesChanged,
  textChanged,
  urlChanged,
  wordCountChangedSignificantly,
} from "./normalizeForComparison.js";

describe("textChanged", () => {
  it("ignores whitespace-only differences", () => {
    expect(textChanged("Hello   World", "Hello World")).toBe(false);
    expect(textChanged("  Hello World  ", "Hello World")).toBe(false);
  });

  it("detects real text changes", () => {
    expect(textChanged("Booking", "Book Paden Sickles")).toBe(true);
  });

  it("treats null/undefined as empty", () => {
    expect(textChanged(null, undefined)).toBe(false);
    expect(textChanged(null, "text")).toBe(true);
  });
});

describe("urlChanged / normalizeUrlForComparison", () => {
  it("ignores trailing slash differences", () => {
    expect(urlChanged("https://example.com/page", "https://example.com/page/")).toBe(false);
  });

  it("ignores UTM parameter differences", () => {
    expect(urlChanged("https://example.com/page", "https://example.com/page?utm_source=newsletter")).toBe(false);
  });

  it("detects real URL changes", () => {
    expect(urlChanged("https://example.com/old", "https://example.com/new")).toBe(true);
  });

  it("treats null canonical consistently", () => {
    expect(urlChanged(null, null)).toBe(false);
    expect(urlChanged(null, "https://example.com/page")).toBe(true);
  });
});

describe("structuredDataTypesChanged / normalizeStructuredDataTypes", () => {
  it("ignores ordering", () => {
    expect(normalizeStructuredDataTypes(["PodcastEpisode", "BreadcrumbList"])).toEqual([
      "BreadcrumbList",
      "PodcastEpisode",
    ]);
    expect(structuredDataTypesChanged(["PodcastEpisode", "BreadcrumbList"], ["BreadcrumbList", "PodcastEpisode"])).toBe(
      false
    );
  });

  it("ignores duplicates", () => {
    expect(structuredDataTypesChanged(["PodcastEpisode"], ["PodcastEpisode", "PodcastEpisode"])).toBe(false);
  });

  it("detects a real type set change", () => {
    expect(structuredDataTypesChanged(["PodcastEpisode"], ["PodcastEpisode", "BreadcrumbList"])).toBe(true);
  });
});

describe("wordCountChangedSignificantly", () => {
  it("ignores small absolute and percentage changes", () => {
    expect(wordCountChangedSignificantly(600, 620)).toBe(false);
  });

  it("flags changes past the absolute threshold", () => {
    expect(wordCountChangedSignificantly(600, 750)).toBe(true);
  });

  it("flags changes past the percentage threshold even if small in absolute terms", () => {
    expect(wordCountChangedSignificantly(50, 70)).toBe(true);
  });
});

describe("internalInboundLinkCountChangedSignificantly", () => {
  it("ignores a small change", () => {
    expect(internalInboundLinkCountChangedSignificantly(10, 11)).toBe(false);
  });

  it("always flags a page becoming orphaned (>0 to 0)", () => {
    expect(internalInboundLinkCountChangedSignificantly(3, 0)).toBe(true);
  });

  it("always flags a page gaining its first inbound link (0 to >0)", () => {
    expect(internalInboundLinkCountChangedSignificantly(0, 2)).toBe(true);
  });

  it("flags large swings even without hitting zero", () => {
    expect(internalInboundLinkCountChangedSignificantly(10, 20)).toBe(true);
  });
});

describe("normalizeUrlForComparison", () => {
  it("produces the same value for trailing-slash variants", () => {
    expect(normalizeUrlForComparison("https://example.com/page/")).toBe(normalizeUrlForComparison("https://example.com/page"));
  });
});
