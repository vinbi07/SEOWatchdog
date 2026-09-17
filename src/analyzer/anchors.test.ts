import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { computeAnchorMetrics, extractAnchors } from "./anchors.js";

const PAGE_URL = "https://example.com/";
const SITE_HOST = "example.com";

describe("extractAnchors", () => {
  it("classifies internal vs external links", () => {
    const $ = cheerio.load(`
      <a href="/about">About</a>
      <a href="https://other.com/page">Other Site</a>
    `);
    const anchors = extractAnchors($, PAGE_URL, SITE_HOST);
    expect(anchors.find((a) => a.href.includes("/about"))?.isInternal).toBe(true);
    expect(anchors.find((a) => a.href.includes("other.com"))?.isInternal).toBe(false);
  });

  it("treats a link with no text and no label as empty", () => {
    const $ = cheerio.load(`<a href="/booking"></a>`);
    const anchors = extractAnchors($, PAGE_URL, SITE_HOST);
    expect(anchors[0]?.text).toBe("");
  });

  it("uses aria-label as the accessible name when there is no visible text", () => {
    const $ = cheerio.load(`<a href="/booking" aria-label="Book a session"></a>`);
    const anchors = extractAnchors($, PAGE_URL, SITE_HOST);
    expect(anchors[0]?.text).toBe("Book a session");
  });

  it("uses a meaningfully-alt'd image as the accessible name", () => {
    const $ = cheerio.load(`<a href="/booking"><img src="icon.png" alt="Book a session" /></a>`);
    const anchors = extractAnchors($, PAGE_URL, SITE_HOST);
    expect(anchors[0]?.text).toBe("Book a session");
  });

  it("does not treat an image with empty alt as a label", () => {
    const $ = cheerio.load(`<a href="/booking"><img src="icon.png" alt="" /></a>`);
    const anchors = extractAnchors($, PAGE_URL, SITE_HOST);
    expect(anchors[0]?.text).toBe("");
  });

  it("skips mailto/tel/javascript/data/blob links", () => {
    const $ = cheerio.load(`
      <a href="mailto:hi@example.com">Email</a>
      <a href="tel:+15551234567">Call</a>
      <a href="javascript:void(0)">JS</a>
    `);
    expect(extractAnchors($, PAGE_URL, SITE_HOST)).toHaveLength(0);
  });
});

describe("computeAnchorMetrics", () => {
  it("counts empty internal anchors", () => {
    const anchors = [
      { href: "https://example.com/a", text: "", isInternal: true },
      { href: "https://example.com/b", text: "Booking", isInternal: true },
    ];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.emptyInternalAnchorCount).toBe(1);
  });

  it("counts generic anchor text", () => {
    const anchors = [
      { href: "https://example.com/a", text: "Click Here", isInternal: true },
      { href: "https://example.com/b", text: "Book a Session", isInternal: true },
    ];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.genericAnchorCount).toBe(1);
  });

  it("does not flag a normal descriptive anchor", () => {
    const anchors = [{ href: "https://example.com/booking", text: "Book Paden for a Speaking Engagement", isInternal: true }];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.genericAnchorCount).toBe(0);
    expect(metrics.emptyInternalAnchorCount).toBe(0);
  });

  it("flags the same text pointing to 3+ distinct internal destinations as ambiguous", () => {
    const anchors = [
      { href: "https://example.com/a", text: "Details", isInternal: true },
      { href: "https://example.com/b", text: "Details", isInternal: true },
      { href: "https://example.com/c", text: "Details", isInternal: true },
    ];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.ambiguousAnchorTextCount).toBe(1);
  });

  it("does not flag ordinary repeated nav text pointing to the same destination", () => {
    const anchors = [
      { href: "https://example.com/about", text: "About", isInternal: true },
      { href: "https://example.com/about", text: "About", isInternal: true },
    ];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.ambiguousAnchorTextCount).toBe(0);
  });

  it("computes raw and unique link counts separately", () => {
    const anchors = [
      { href: "https://example.com/a", text: "A", isInternal: true },
      { href: "https://example.com/a", text: "A again", isInternal: true },
      { href: "https://example.com/b", text: "B", isInternal: true },
    ];
    const metrics = computeAnchorMetrics(anchors);
    expect(metrics.internalLinkCount).toBe(3);
    expect(metrics.uniqueInternalLinkCount).toBe(2);
  });
});
