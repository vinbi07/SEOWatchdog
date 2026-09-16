import { describe, expect, it } from "vitest";
import { config } from "../config/config.js";
import { normalizeUrl } from "../utils/urls.js";
import { findCoverageIssues } from "./coverageRules.js";
import { makePage } from "./testFixtures.js";

describe("findCoverageIssues - discoveredNotInSitemap", () => {
  it("counts any successfully crawled discovered page absent from the sitemap, indexable or not", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const episodeUrl = `${config.siteOrigin}/episodes/some-slug`;
    const utilityUrl = `${config.siteOrigin}/thank-you`;

    const home = makePage({
      url: homeUrl,
      internalLinks: [episodeUrl, utilityUrl],
      sources: { sitemap: true, discovered: false },
    });
    const episode = makePage({
      url: episodeUrl,
      isIndexable: true,
      sources: { sitemap: false, discovered: true },
    });
    const utility = makePage({
      url: utilityUrl,
      isIndexable: false,
      noindex: true,
      sources: { sitemap: false, discovered: true },
    });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!]);
    const result = findCoverageIssues([home, episode, utility], sitemapUrls);

    expect(result.discoveredNotInSitemapCount).toBe(2);
  });

  it("does not count a discovered page not in sitemap when it was never crawled successfully", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const brokenUrl = `${config.siteOrigin}/broken`;

    const home = makePage({ url: homeUrl, internalLinks: [brokenUrl] });
    const broken = makePage({
      url: brokenUrl,
      status: 500,
      outcome: "http_error",
      sources: { sitemap: false, discovered: true },
    });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!]);
    const result = findCoverageIssues([home, broken], sitemapUrls);

    expect(result.discoveredNotInSitemapCount).toBe(0);
  });
});

describe("findCoverageIssues - indexableMissingFromSitemap", () => {
  it("flags an indexable, internally discovered page that isn't in the sitemap", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const episodeUrl = `${config.siteOrigin}/episodes/some-slug`;

    const home = makePage({
      url: homeUrl,
      internalLinks: [episodeUrl],
      sources: { sitemap: true, discovered: false },
    });
    const episode = makePage({
      url: episodeUrl,
      pageType: "episode",
      isIndexable: true,
      sources: { sitemap: false, discovered: true },
    });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!]);
    const result = findCoverageIssues([home, episode], sitemapUrls);

    const issues = result.issuesByUrl.get(episodeUrl);
    expect(issues?.some((i) => i.issueType === "indexable_page_missing_from_sitemap")).toBe(true);
    expect(result.indexableMissingFromSitemapCount).toBe(1);
  });

  it("does not flag a discovered page that is also present in the sitemap", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const episodeUrl = `${config.siteOrigin}/episodes/some-slug`;

    const home = makePage({ url: homeUrl, internalLinks: [episodeUrl] });
    const episode = makePage({
      url: episodeUrl,
      isIndexable: true,
      sources: { sitemap: true, discovered: true },
    });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!, normalizeUrl(episodeUrl)!]);
    const result = findCoverageIssues([home, episode], sitemapUrls);

    expect(result.issuesByUrl.get(episodeUrl)).toBeUndefined();
    expect(result.indexableMissingFromSitemapCount).toBe(0);
  });
});

describe("findCoverageIssues - nonIndexableMissingFromSitemap", () => {
  it("tracks a noindex discovered page missing from the sitemap as informational, not an issue", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const utilityUrl = `${config.siteOrigin}/thank-you`;

    const home = makePage({ url: homeUrl, internalLinks: [utilityUrl] });
    const utility = makePage({
      url: utilityUrl,
      isIndexable: false,
      noindex: true,
      sources: { sitemap: false, discovered: true },
    });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!]);
    const result = findCoverageIssues([home, utility], sitemapUrls);

    expect(result.issuesByUrl.get(utilityUrl)).toBeUndefined();
    expect(result.indexableMissingFromSitemapCount).toBe(0);
    expect(result.nonIndexableMissingFromSitemapCount).toBe(1);
  });
});

describe("findCoverageIssues - orphaned sitemap page", () => {
  it("flags an indexable sitemap page with no internal links pointing to it", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const orphanUrl = `${config.siteOrigin}/old-campaign`;

    const home = makePage({ url: homeUrl, internalLinks: [], sources: { sitemap: false, discovered: false } });
    const orphan = makePage({ url: orphanUrl, isIndexable: true, sources: { sitemap: true, discovered: false } });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!, normalizeUrl(orphanUrl)!]);
    const result = findCoverageIssues([home, orphan], sitemapUrls);

    const issues = result.issuesByUrl.get(orphanUrl);
    expect(issues?.some((i) => i.issueType === "orphaned_sitemap_page")).toBe(true);
    expect(result.orphanedSitemapPageCount).toBe(1);
  });

  it("does not flag a sitemap page that is linked from another crawled page", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const linkedUrl = `${config.siteOrigin}/episodes/some-slug`;

    const home = makePage({
      url: homeUrl,
      internalLinks: [linkedUrl],
      sources: { sitemap: false, discovered: false },
    });
    const linked = makePage({ url: linkedUrl, isIndexable: true, sources: { sitemap: true, discovered: false } });

    const sitemapUrls = new Set([normalizeUrl(homeUrl)!, normalizeUrl(linkedUrl)!]);
    const result = findCoverageIssues([home, linked], sitemapUrls);

    expect(result.issuesByUrl.get(linkedUrl)).toBeUndefined();
    expect(result.orphanedSitemapPageCount).toBe(0);
  });

  it("excludes a page's link to itself when counting inbound links", () => {
    const orphanUrl = `${config.siteOrigin}/self-linking`;
    // The page links to itself (e.g. a "back to top" anchor resolved to the page URL)
    // but nothing else links to it — it should still be considered orphaned.
    const orphan = makePage({
      url: orphanUrl,
      isIndexable: true,
      internalLinks: [orphanUrl],
      sources: { sitemap: true, discovered: false },
    });

    const sitemapUrls = new Set([normalizeUrl(orphanUrl)!]);
    const result = findCoverageIssues([orphan], sitemapUrls);

    expect(result.orphanedSitemapPageCount).toBe(1);
  });

  it("does not flag an intentionally noindexed sitemap utility page as orphaned", () => {
    const utilityUrl = `${config.siteOrigin}/thank-you`;
    const utility = makePage({
      url: utilityUrl,
      isIndexable: false,
      noindex: true,
      internalLinks: [],
      sources: { sitemap: true, discovered: false },
    });

    const sitemapUrls = new Set([normalizeUrl(utilityUrl)!]);
    const result = findCoverageIssues([utility], sitemapUrls);

    expect(result.issuesByUrl.get(utilityUrl)).toBeUndefined();
    expect(result.orphanedSitemapPageCount).toBe(0);
  });
});
