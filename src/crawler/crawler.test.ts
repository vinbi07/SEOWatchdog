import { describe, expect, it } from "vitest";
import { config } from "../config/config.js";
import { resolveInternalInboundLinkCounts, resolvePageSources } from "./crawler.js";
import { makePage } from "../rules/testFixtures.js";

describe("resolveInternalInboundLinkCounts", () => {
  it("counts how many other crawled pages link to each page", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const episodeAUrl = `${config.siteOrigin}/episodes/a`;
    const episodeBUrl = `${config.siteOrigin}/episodes/b`;

    const home = makePage({ url: homeUrl, internalLinks: [episodeAUrl, episodeBUrl] });
    const episodeA = makePage({ url: episodeAUrl, internalLinks: [episodeBUrl] });
    const episodeB = makePage({ url: episodeBUrl, internalLinks: [] });

    const pages = [home, episodeA, episodeB];
    resolveInternalInboundLinkCounts(pages);

    expect(home.internalInboundLinkCount).toBe(0);
    expect(episodeA.internalInboundLinkCount).toBe(1);
    expect(episodeB.internalInboundLinkCount).toBe(2);
  });

  it("does not count a page's link to itself", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const home = makePage({ url: homeUrl, internalLinks: [homeUrl] });

    resolveInternalInboundLinkCounts([home]);

    expect(home.internalInboundLinkCount).toBe(0);
  });
});

describe("resolvePageSources", () => {
  it("marks a sitemap-only page as also discovered when another crawled page links to it", () => {
    const homeUrl = `${config.siteOrigin}/`;
    const episodeUrl = `${config.siteOrigin}/episodes/some-slug`;

    const home = makePage({
      url: homeUrl,
      internalLinks: [episodeUrl],
      sources: { sitemap: true, discovered: false },
    });
    const episode = makePage({
      url: episodeUrl,
      sources: { sitemap: true, discovered: false },
    });

    resolvePageSources([home, episode]);

    expect(episode.sources).toEqual({ sitemap: true, discovered: true });
  });

  it("leaves a page's discovered flag false when nothing links to it", () => {
    const orphanUrl = `${config.siteOrigin}/orphan`;
    const orphan = makePage({ url: orphanUrl, sources: { sitemap: true, discovered: false } });

    resolvePageSources([orphan]);

    expect(orphan.sources).toEqual({ sitemap: true, discovered: false });
  });

  it("does not mark discovered=true from a page's link to itself", () => {
    const selfUrl = `${config.siteOrigin}/self`;
    const page = makePage({ url: selfUrl, internalLinks: [selfUrl], sources: { sitemap: true, discovered: false } });

    resolvePageSources([page]);

    expect(page.sources.discovered).toBe(false);
  });
});
