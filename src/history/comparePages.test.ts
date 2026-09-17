import { describe, expect, it } from "vitest";
import { makePage } from "../rules/testFixtures.js";
import { comparePages } from "./comparePages.js";
import { normalizeUrlForComparison } from "./normalizeForComparison.js";
import type { PreviousPageRecord } from "./types.js";

const URL = "https://example.com/booking";

function previousPage(overrides: Partial<PreviousPageRecord> = {}): PreviousPageRecord {
  return {
    normalizedUrl: normalizeUrlForComparison(URL),
    url: URL,
    finalUrl: URL,
    statusCode: 200,
    title: "Booking",
    metaDescription: "Book a session.",
    canonical: URL,
    h1Count: 1,
    wordCount: 500,
    noindex: false,
    isIndexable: true,
    indexingState: "indexable",
    publicationState: "unknown",
    pageType: "booking",
    sourceSitemap: true,
    sourceDiscovered: false,
    internalInboundLinkCount: 5,
    structuredDataTypes: [],
    ...overrides,
  };
}

describe("comparePages", () => {
  it("detects a brand new page", () => {
    const current = [makePage({ url: "https://example.com/new-page" })];
    const result = comparePages(current, []);
    expect(result.newPageCount).toBe(1);
    expect(result.changes.some((c) => c.eventType === "page_new")).toBe(true);
  });

  it("detects a page missing from the current crawl", () => {
    const result = comparePages([], [previousPage()]);
    expect(result.removedPageCount).toBe(1);
    const event = result.changes.find((c) => c.eventType === "page_removed");
    expect(event?.message).toMatch(/previous crawl/i);
  });

  it("detects a title change", () => {
    const current = [makePage({ url: URL, title: "Book Paden Sickles" })];
    const result = comparePages(current, [previousPage({ title: "Booking" })]);
    const event = result.changes.find((c) => c.fieldName === "title");
    expect(event).toBeDefined();
    expect(result.changedPageCount).toBe(1);
  });

  it("does not flag whitespace-only title differences", () => {
    const current = [makePage({ url: URL, title: "Booking  Page" })];
    const result = comparePages(current, [previousPage({ title: "Booking Page" })]);
    expect(result.changes.some((c) => c.fieldName === "title")).toBe(false);
  });

  it("detects a canonical change", () => {
    const current = [makePage({ url: URL, canonical: "https://example.com/booking-2" })];
    const result = comparePages(current, [previousPage({ canonical: URL })]);
    expect(result.changes.some((c) => c.eventType === "canonical_changed")).toBe(true);
  });

  it("detects HTTP status regressions", () => {
    const current = [makePage({ url: URL, status: 404 })];
    const result = comparePages(current, [previousPage({ statusCode: 200 })]);
    const event = result.changes.find((c) => c.eventType === "http_status_changed");
    expect(event?.previousValue).toBe(200);
    expect(event?.currentValue).toBe(404);
  });

  it("detects an indexability change from indexable to noindex", () => {
    const current = [makePage({ url: URL, isIndexable: false, indexingState: "noindex_review" })];
    const result = comparePages(current, [previousPage({ isIndexable: true, indexingState: "indexable" })]);
    expect(result.changes.some((c) => c.eventType === "indexability_changed")).toBe(true);
    expect(result.changes.some((c) => c.eventType === "indexing_state_changed")).toBe(true);
  });

  it("detects sitemap membership changes", () => {
    const current = [makePage({ url: URL, sources: { sitemap: false, discovered: true } })];
    const result = comparePages(current, [previousPage({ sourceSitemap: true, sourceDiscovered: true })]);
    expect(result.changes.some((c) => c.eventType === "page_removed_from_sitemap")).toBe(true);
  });

  it("always flags a page becoming orphaned even though it's a small absolute change", () => {
    const current = [makePage({ url: URL, internalInboundLinkCount: 0 })];
    const result = comparePages(current, [previousPage({ internalInboundLinkCount: 1 })]);
    const event = result.changes.find((c) => c.fieldName === "internal_inbound_link_count");
    expect(event).toBeDefined();
    expect(event?.metadata.possiblyOrphaned).toBe(true);
  });

  it("ignores structured data ordering", () => {
    const current = [
      makePage({ url: URL, structuredData: [{ type: "BreadcrumbList" }, { type: "PodcastEpisode" }] }),
    ];
    const result = comparePages(current, [
      previousPage({ structuredDataTypes: ["PodcastEpisode", "BreadcrumbList"] }),
    ]);
    expect(result.changes.some((c) => c.fieldName === "structured_data")).toBe(false);
  });

  it("does not flag a page with no changes at all", () => {
    const page = makePage({ url: URL, sources: { sitemap: true, discovered: false } });
    const matchingPrevious = previousPage({
      title: page.title,
      metaDescription: page.metaDescription,
      canonical: page.canonical,
      finalUrl: page.finalUrl,
      statusCode: page.status,
      internalInboundLinkCount: page.internalInboundLinkCount,
    });
    const result = comparePages([page], [matchingPrevious]);
    expect(result.changes).toHaveLength(0);
    expect(result.changedPageCount).toBe(0);
  });
});
