import { describe, expect, it } from "vitest";
import { dedupeUrls, isCrawlableDiscoveredUrl, isLikelyAssetUrl, isSameDomain, normalizeUrl } from "./urls.js";

describe("normalizeUrl", () => {
  it("strips the fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
  });

  it("removes a single trailing slash except for root", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("lowercases the hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Page")).toBe("https://example.com/Page");
  });

  it("drops default ports", () => {
    expect(normalizeUrl("https://example.com:443/page")).toBe("https://example.com/page");
    expect(normalizeUrl("http://example.com:80/page")).toBe("http://example.com/page");
  });

  it("resolves relative URLs against a base", () => {
    expect(normalizeUrl("/about", "https://example.com/blog/post")).toBe("https://example.com/about");
  });

  it("returns null for invalid URLs", () => {
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("strips UTM/tracking query parameters", () => {
    expect(normalizeUrl("https://example.com/page?utm_source=newsletter&utm_medium=email")).toBe(
      "https://example.com/page"
    );
  });

  it("normalizes tracking-parameter variants to the same URL", () => {
    const a = normalizeUrl("https://example.com/page?utm_source=fb&fbclid=abc123");
    const b = normalizeUrl("https://example.com/page?utm_source=ig&gclid=xyz789");
    expect(a).toBe(b);
    expect(a).toBe("https://example.com/page");
  });

  it("preserves non-tracking query parameters", () => {
    expect(normalizeUrl("https://example.com/search?q=foo")).toBe("https://example.com/search?q=foo");
  });
});

describe("isLikelyAssetUrl", () => {
  it("flags common asset extensions", () => {
    expect(isLikelyAssetUrl("https://example.com/image.jpg")).toBe(true);
    expect(isLikelyAssetUrl("https://example.com/file.pdf")).toBe(true);
    expect(isLikelyAssetUrl("https://example.com/script.js")).toBe(true);
    expect(isLikelyAssetUrl("https://example.com/font.woff2")).toBe(true);
  });

  it("does not flag normal page paths", () => {
    expect(isLikelyAssetUrl("https://example.com/episodes/some-slug")).toBe(false);
    expect(isLikelyAssetUrl("https://example.com/booking/speaking")).toBe(false);
  });
});

describe("isCrawlableDiscoveredUrl", () => {
  it("rejects asset URLs", () => {
    expect(isCrawlableDiscoveredUrl("https://example.com/image.jpg")).toBe(false);
  });

  it("accepts plain page URLs", () => {
    expect(isCrawlableDiscoveredUrl("https://example.com/episodes/some-slug")).toBe(true);
  });

  it("rejects URLs with excessive query parameters", () => {
    expect(isCrawlableDiscoveredUrl("https://example.com/list?a=1&b=2&c=3&d=4")).toBe(false);
  });
});

describe("isSameDomain", () => {
  it("matches identical hosts case-insensitively", () => {
    expect(isSameDomain("https://Example.com/page", "example.com")).toBe(true);
  });

  it("rejects different hosts", () => {
    expect(isSameDomain("https://other.com/page", "example.com")).toBe(false);
  });
});

describe("dedupeUrls", () => {
  it("removes duplicate entries while preserving order", () => {
    expect(dedupeUrls(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
});
