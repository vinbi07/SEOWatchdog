import { describe, expect, it } from "vitest";
import { config } from "../config/config.js";
import { makePage } from "../rules/testFixtures.js";
import { analyzeIndexingState } from "./analyzeIndexingState.js";

describe("analyzeIndexingState - indexable pages", () => {
  it("is indexable when not noindex", () => {
    const page = makePage({ noindex: false });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("indexable");
    expect(result.issues).toHaveLength(0);
  });
});

describe("analyzeIndexingState - sitemap noindex", () => {
  it("treats a noindex sitemap page as unexpected (issue raised separately by sitemap_url_noindex rule)", () => {
    const page = makePage({ noindex: true, sources: { sitemap: true, discovered: false } });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_unexpected");
    expect(result.issues).toHaveLength(0);
  });
});

describe("analyzeIndexingState - episode publication state", () => {
  const episodeUrl = `${config.siteOrigin}/episodes/some-slug`;

  it("flags a published episode marked noindex as unexpected/high severity", () => {
    const page = makePage({
      url: episodeUrl,
      pageType: "episode",
      noindex: true,
      publicationState: "published",
      sources: { sitemap: false, discovered: true },
    });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_unexpected");
    const issue = result.issues.find((i) => i.issueType === "unexpected_noindex");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
  });

  it("does not flag a draft episode marked noindex as an error", () => {
    const page = makePage({
      url: episodeUrl,
      pageType: "episode",
      noindex: true,
      publicationState: "draft",
      sources: { sitemap: false, discovered: true },
    });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_expected");
    expect(result.issues.some((i) => i.severity === "high")).toBe(false);
  });

  it("does not flag a scheduled episode marked noindex as an error", () => {
    const page = makePage({
      url: episodeUrl,
      pageType: "episode",
      noindex: true,
      publicationState: "scheduled",
      sources: { sitemap: false, discovered: true },
    });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_expected");
    expect(result.issues).toHaveLength(0);
  });

  it("flags an episode with unknown publication state for low-severity review", () => {
    const page = makePage({
      url: episodeUrl,
      pageType: "episode",
      noindex: true,
      publicationState: "unknown",
      sources: { sitemap: false, discovered: true },
    });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_review");
    const issue = result.issues.find((i) => i.issueType === "noindex_requires_review");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("low");
  });
});

describe("analyzeIndexingState - page types without indexing rules", () => {
  it("treats a noindex generic/utility page as expected, not an error", () => {
    const page = makePage({
      url: `${config.siteOrigin}/thank-you`,
      pageType: "generic",
      noindex: true,
      sources: { sitemap: false, discovered: true },
    });
    const result = analyzeIndexingState(page);
    expect(result.indexingState).toBe("noindex_expected");
    expect(result.issues).toHaveLength(0);
  });
});

describe("analyzeIndexingState - publication state defaults", () => {
  it("defaults publicationState to unknown on the base fixture", () => {
    const page = makePage();
    expect(page.publicationState).toBe("unknown");
  });
});
