import { describe, expect, it } from "vitest";
import { dedupeUrls, isSameDomain, normalizeUrl } from "./urls.js";

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
